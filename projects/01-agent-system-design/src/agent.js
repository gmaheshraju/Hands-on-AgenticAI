// ─── ReAct Agent Loop ────────────────────────────────────────────────────────
// Implements the Observe → Think → Act cycle for PR code review.
//
// The loop:
//   1. OBSERVE — present the current state (PR info, findings so far, tool results)
//   2. THINK  — the LLM reasons about what to investigate next
//   3. ACT    — the LLM calls a tool or emits FINISH with structured findings
//
// Key design decisions:
//   - Hard iteration cap (default 15) prevents runaway loops
//   - Token tracking for cost estimation
//   - Stall detection: if 2 consecutive iterations produce no new information, stop
//   - The LLM sees tool descriptions and the structured output schema in its system prompt
//   - Findings are validated, deduplicated, and sorted before output

import { FINDING_SCHEMA, REVIEW_OUTPUT_SCHEMA, validateFinding, deduplicateFindings, sortFindings, SEVERITY, CATEGORY } from './schema.js';
import { toolDescriptionsForPrompt } from './tools.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  maxIterations: 15,       // Hard cap on tool calls
  staleThreshold: 2,       // Stop after N iterations with no progress
  maxTokensEstimate: 0,    // Accumulated token estimate (output only)
  verbose: true,           // Log each step to console
};

// Rough token estimate: 4 chars per token (good enough for cost tracking)
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// ─── System Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(tools) {
  return `You are an expert code reviewer analyzing a GitHub Pull Request.

## Your Process (ReAct Pattern)

Each turn you MUST output exactly ONE of these two formats:

### Format A — Use a Tool
\`\`\`
THOUGHT: <your reasoning about what to investigate and why>
ACTION: <tool_name>
ACTION_INPUT: <JSON arguments for the tool, or {} if no arguments>
\`\`\`

### Format B — Finish the Review
\`\`\`
THOUGHT: <final reasoning summarizing your review>
FINISH:
<JSON object matching the review output schema below>
\`\`\`

## Available Tools

${toolDescriptionsForPrompt(tools)}

## Review Output Schema

When you FINISH, output a JSON object with this structure:
${JSON.stringify(REVIEW_OUTPUT_SCHEMA, null, 2)}

Each finding must have these fields:
${JSON.stringify(FINDING_SCHEMA, null, 2)}

Valid severities: ${Object.values(SEVERITY).join(', ')}
Valid categories: ${Object.values(CATEGORY).join(', ')}

## Review Strategy

1. Start by fetching the PR metadata (fetchPR) to understand what the PR is about.
2. Fetch the diff (fetchDiff) to see what changed.
3. Prioritize reviewing:
   - Files with security implications (auth, crypto, user input handling)
   - Files with complex logic changes (not just renames/formatting)
   - New files (more likely to have design issues)
   - Skip: lockfiles, generated code, pure whitespace changes, vendor files
4. For suspicious changes, fetch the full file (fetchFile) or search for callers (searchCode).
5. Look for: bugs, null/undefined risks, missing error handling, security issues, race conditions, resource leaks, API misuse, poor naming, missing tests for complex logic.
6. Group duplicate findings — if the same issue appears in 4 files, report it once with groupedFiles.
7. Be specific: cite the exact line and code. Don't say "consider adding error handling" without saying WHERE and for WHAT.

## Rules
- NEVER fabricate line numbers. If you don't know the exact line, use 0.
- Be precise. A vague finding is worse than no finding.
- Prioritize bugs and security over style nits.
- Do NOT report issues in files you haven't actually read.
- You MUST finish within ${DEFAULT_CONFIG.maxIterations} tool calls.`;
}

// ─── ReAct Loop ──────────────────────────────────────────────────────────────

/**
 * Parse the LLM's response into a structured action.
 * Returns { thought, action, actionInput } or { thought, finish, output }.
 */
function parseAgentResponse(text) {
  const result = { thought: '', raw: text };

  // Extract THOUGHT
  const thoughtMatch = text.match(/THOUGHT:\s*([\s\S]*?)(?=\n(?:ACTION|FINISH):)/);
  if (thoughtMatch) result.thought = thoughtMatch[1].trim();

  // Check for FINISH
  const finishMatch = text.match(/FINISH:\s*([\s\S]*)/);
  if (finishMatch) {
    let jsonStr = finishMatch[1].trim();
    // Strip markdown code fences if present
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    try {
      result.finish = true;
      result.output = JSON.parse(jsonStr);
    } catch (e) {
      result.finish = true;
      result.parseError = `Failed to parse FINISH JSON: ${e.message}`;
      result.rawOutput = jsonStr;
    }
    return result;
  }

  // Check for ACTION
  const actionMatch = text.match(/ACTION:\s*(\w+)/);
  const inputMatch = text.match(/ACTION_INPUT:\s*([\s\S]*?)$/);
  if (actionMatch) {
    result.action = actionMatch[1].trim();
    if (inputMatch) {
      let inputStr = inputMatch[1].trim();
      inputStr = inputStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      try {
        result.actionInput = JSON.parse(inputStr);
      } catch {
        result.actionInput = {};
      }
    } else {
      result.actionInput = {};
    }
    return result;
  }

  // Could not parse — treat as an error
  result.error = 'Could not parse THOUGHT/ACTION or FINISH from response';
  return result;
}

/**
 * Run the ReAct agent loop.
 *
 * @param {object} options
 * @param {Function} options.llmCall - async (messages) => string — the LLM completion function
 * @param {object[]} options.tools - tool objects from createTools()
 * @param {object} options.toolContext - { owner, repo, number, token, mockData, head }
 * @param {object} [options.config] - override DEFAULT_CONFIG
 * @returns {object} { output, iterations, tokenEstimate, trace }
 */
export async function runReActLoop({ llmCall, tools, toolContext, config = {} }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const systemPrompt = buildSystemPrompt(tools);

  // Build a lookup map for tools
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

  // Conversation history for the LLM
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Review this PR. Begin by fetching the PR metadata, then the diff, then investigate.`,
    },
  ];

  // Tracking
  const trace = [];          // Full trace of each iteration
  let totalTokens = 0;
  let staleCount = 0;        // Consecutive iterations without new info
  let lastObservationLen = 0;

  for (let i = 0; i < cfg.maxIterations; i++) {
    const iterLabel = `[Iteration ${i + 1}/${cfg.maxIterations}]`;

    // ── THINK: call the LLM ──
    if (cfg.verbose) console.log(`\n${iterLabel} Calling LLM...`);
    const response = await llmCall(messages);
    totalTokens += estimateTokens(JSON.stringify(messages)) + estimateTokens(response);

    // ── Parse the response ──
    const parsed = parseAgentResponse(response);
    trace.push({ iteration: i + 1, ...parsed });

    if (cfg.verbose && parsed.thought) {
      console.log(`  THOUGHT: ${parsed.thought.slice(0, 200)}${parsed.thought.length > 200 ? '...' : ''}`);
    }

    // ── FINISH ──
    if (parsed.finish) {
      if (parsed.parseError) {
        if (cfg.verbose) console.log(`  FINISH parse error: ${parsed.parseError}`);
        // Ask the LLM to fix its output
        messages.push({ role: 'assistant', content: response });
        messages.push({
          role: 'user',
          content: `Your FINISH output was not valid JSON: ${parsed.parseError}\nPlease try again with valid JSON matching the schema.`,
        });
        continue;
      }

      if (cfg.verbose) console.log(`  FINISH: ${parsed.output.findings?.length ?? 0} findings`);

      // Post-process findings
      let findings = (parsed.output.findings || []).map((f) => {
        const validation = validateFinding(f);
        if (!validation.valid && cfg.verbose) {
          console.log(`  Warning: invalid finding — ${validation.errors.join(', ')}`);
        }
        return f;
      });

      findings = deduplicateFindings(findings);
      findings = sortFindings(findings);

      return {
        output: {
          ...parsed.output,
          findings,
        },
        iterations: i + 1,
        tokenEstimate: totalTokens,
        trace,
      };
    }

    // ── ACT: execute the tool ──
    if (parsed.action) {
      const tool = toolMap[parsed.action];
      if (!tool) {
        const errMsg = `Unknown tool: ${parsed.action}. Available: ${Object.keys(toolMap).join(', ')}`;
        if (cfg.verbose) console.log(`  ERROR: ${errMsg}`);
        messages.push({ role: 'assistant', content: response });
        messages.push({ role: 'user', content: `OBSERVATION: Error — ${errMsg}` });
        continue;
      }

      if (cfg.verbose) console.log(`  ACTION: ${parsed.action}(${JSON.stringify(parsed.actionInput)})`);

      let observation;
      try {
        const result = await tool.execute(parsed.actionInput, toolContext);
        observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      } catch (err) {
        observation = `Error executing ${parsed.action}: ${err.message}`;
      }

      // Truncate very large observations to avoid blowing context
      const MAX_OBS = 12000;
      if (observation.length > MAX_OBS) {
        observation = observation.slice(0, MAX_OBS) + `\n\n[...truncated, ${observation.length - MAX_OBS} chars omitted]`;
      }

      if (cfg.verbose) console.log(`  OBSERVATION: ${observation.slice(0, 300)}${observation.length > 300 ? '...' : ''}`);

      // Stall detection
      if (observation.length === lastObservationLen) {
        staleCount++;
        if (staleCount >= cfg.staleThreshold) {
          if (cfg.verbose) console.log(`  STALL DETECTED: ${staleCount} identical observations. Forcing finish.`);
          messages.push({ role: 'assistant', content: response });
          messages.push({
            role: 'user',
            content: `You seem to be stuck — the last ${staleCount} observations were identical. Please FINISH now with whatever findings you have.`,
          });
          continue;
        }
      } else {
        staleCount = 0;
      }
      lastObservationLen = observation.length;

      messages.push({ role: 'assistant', content: response });
      messages.push({ role: 'user', content: `OBSERVATION:\n${observation}` });
      continue;
    }

    // ── Parse failure ──
    if (parsed.error) {
      if (cfg.verbose) console.log(`  PARSE ERROR: ${parsed.error}`);
      messages.push({ role: 'assistant', content: response });
      messages.push({
        role: 'user',
        content: `I could not parse your response. You MUST use either:\n\nTHOUGHT: ...\nACTION: <tool_name>\nACTION_INPUT: <json>\n\nOR\n\nTHOUGHT: ...\nFINISH:\n<json>\n\nPlease try again.`,
      });
    }
  }

  // Iteration cap reached — force output
  if (cfg.verbose) console.log(`\n[MAX ITERATIONS REACHED] Forcing finish.`);
  return {
    output: {
      findings: [],
      summary: 'Review terminated: reached maximum iteration cap without completing.',
      filesReviewed: [],
      filesSkipped: [],
    },
    iterations: cfg.maxIterations,
    tokenEstimate: totalTokens,
    trace,
    cappedOut: true,
  };
}
