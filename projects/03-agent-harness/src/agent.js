/**
 * Research Agent
 *
 * Implements the Observe -> Think -> Act -> Evaluate loop.
 * The agent takes a research question and builds a structured report
 * by searching, reading pages, and noting findings.
 *
 * This is a deterministic/scripted agent (no LLM calls) — the focus
 * of this project is the harness, not the planning.  In production you
 * would replace the `planNextStep` function with an LLM call.
 */

import { TOOL_REGISTRY } from './tools.js';

// ── Research plan templates ─────────────────────────────────────────────

/**
 * Given a question, produce a list of planned steps.
 * Each step is { thought, tool, toolInput }.
 *
 * A real agent would call an LLM here.  We simulate structured reasoning.
 */
function buildResearchPlan(question) {
  const q = question.toLowerCase();
  const steps = [];

  // Phase 1: Broad search to understand the landscape
  steps.push({
    thought: 'Start with a broad search to understand the topic',
    tool: 'webSearch',
    toolInput: { query: question },
  });

  // Phase 2: Extract key entities and search each
  const entities = extractEntities(question);
  for (const entity of entities) {
    steps.push({
      thought: `Search for specific information about ${entity}`,
      tool: 'webSearch',
      toolInput: { query: `${entity} pricing` },
    });
    steps.push({
      thought: `Search for ${entity} in production context`,
      tool: 'webSearch',
      toolInput: { query: `${entity} production RAG` },
    });
  }

  // Phase 3: Read the most promising pages
  steps.push({
    thought: 'Read the detailed comparison page for structured data',
    tool: 'readPage',
    toolInput: { url: 'https://blog.example.com/vdb-compare' },
  });
  steps.push({
    thought: 'Read the RAG-specific comparison for decision framework',
    tool: 'readPage',
    toolInput: { url: 'https://blog.example.com/rag-vdb' },
  });

  // Phase 4: Search for performance data
  steps.push({
    thought: 'Search for performance benchmarks at scale',
    tool: 'webSearch',
    toolInput: { query: 'vector database performance 10M documents' },
  });

  return steps;
}

/**
 * Extract key entities from the question (simulated NER).
 */
function extractEntities(question) {
  const known = ['pinecone', 'weaviate', 'qdrant', 'milvus', 'chroma', 'pgvector'];
  const q = question.toLowerCase();
  return known.filter((e) => q.includes(e));
}

// ── The Agent ───────────────────────────────────────────────────────────

export class ResearchAgent {
  constructor(question) {
    this.question = question;
    this.report = {
      question,
      sections: {},
    };
    this.plan = buildResearchPlan(question);
    this.stepIndex = 0;
    this.pendingReadResults = [];   // URLs from search to potentially read
    this.searchResultsBuffer = [];  // raw search results for note-taking
  }

  /**
   * Execute one iteration.  Called by the harness.
   *
   * @param {number} iteration
   * @returns {object} StepResult for the harness
   */
  async step(iteration) {
    // ── Phase: Note findings from previous search/read ──────────────
    if (this.searchResultsBuffer.length > 0) {
      return this._noteFindingsFromBuffer(iteration);
    }

    // ── Phase: Execute planned steps ────────────────────────────────
    if (this.stepIndex < this.plan.length) {
      const planned = this.plan[this.stepIndex];
      this.stepIndex++;
      return this._executeTool(planned, iteration);
    }

    // ── Phase: Synthesize final report ──────────────────────────────
    return this._synthesize(iteration);
  }

  // ── Internal methods ──────────────────────────────────────────────

  async _executeTool(planned, iteration) {
    const toolDef = TOOL_REGISTRY[planned.tool];
    const args = [planned.toolInput];
    if (toolDef.needsReport) args.push(this.report);

    const { result, tokensIn, tokensOut } = await toolDef.fn(...args);

    // If this was a search, buffer results for note-taking
    if (planned.tool === 'webSearch' && Array.isArray(result)) {
      const facts = result.map(
        (r) => `${r.title}: ${r.snippet}`
      );
      const sources = result.map((r) => r.url);
      this.searchResultsBuffer.push({
        section: guessSectionName(planned.toolInput.query),
        facts,
        sources,
      });
    }

    // If this was a page read, buffer content for note-taking
    if (planned.tool === 'readPage' && typeof result === 'string') {
      const facts = extractFactsFromPage(result);
      this.searchResultsBuffer.push({
        section: 'Detailed Comparison',
        facts,
        sources: [planned.toolInput.url],
      });
    }

    return {
      thought: planned.thought,
      tool: planned.tool,
      toolInput: planned.toolInput,
      tokensIn,
      tokensOut,
      newFactsAdded: 0,  // facts are added in the note-taking step
      done: false,
    };
  }

  async _noteFindingsFromBuffer(_iteration) {
    const buffered = this.searchResultsBuffer.shift();
    const toolDef = TOOL_REGISTRY.noteFindings;
    const { result, tokensIn, tokensOut } = await toolDef.fn(buffered, this.report);

    return {
      thought: `Recording ${buffered.facts.length} findings under "${buffered.section}"`,
      tool: 'noteFindings',
      toolInput: { section: buffered.section, factCount: buffered.facts.length },
      tokensIn,
      tokensOut,
      newFactsAdded: result.newFactsAdded,
      done: false,
    };
  }

  async _synthesize(_iteration) {
    const toolDef = TOOL_REGISTRY.synthesize;
    const { result, tokensIn, tokensOut } = await toolDef.fn({}, this.report);
    this.finalReport = result;

    return {
      thought: 'All research complete — synthesizing final report',
      tool: 'synthesize',
      toolInput: {},
      tokensIn,
      tokensOut,
      newFactsAdded: 0,
      done: true,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function guessSectionName(query) {
  const q = query.toLowerCase();
  if (q.includes('pricing') || q.includes('cost')) return 'Pricing';
  if (q.includes('performance') || q.includes('benchmark')) return 'Performance';
  if (q.includes('production') || q.includes('rag')) return 'Production RAG Features';
  if (q.includes('compare') || q.includes('vs')) return 'Overview';
  return 'General Findings';
}

function extractFactsFromPage(content) {
  // Extract bullet points and table rows as facts
  const lines = content.split('\n');
  const facts = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- **') || trimmed.startsWith('| ')) {
      if (!trimmed.startsWith('|--') && !trimmed.startsWith('| Database') && !trimmed.startsWith('| Provider')) {
        facts.push(trimmed.replace(/^\||\|$/g, '').trim());
      }
    }
  }
  return facts.length > 0 ? facts : ['Page contained general information about the topic.'];
}
