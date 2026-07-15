/**
 * Evaluation dimensions for RAG systems.
 * Each dimension has a scoring rubric prompt that produces structured scores.
 *
 * The key insight: out-of-the-box LLM judges rate everything 4-5/5.
 * Concrete failure examples and mandatory justifications force calibrated scoring.
 */

/**
 * Build the faithfulness scoring prompt.
 * Checks: is every claim in the answer grounded in the source documents?
 */
export function buildFaithfulnessPrompt({ question, answer, sourceContent }) {
  return `You are a strict faithfulness evaluator for a RAG (Retrieval-Augmented Generation) system.

Your job: determine whether the answer is GROUNDED in the provided source documents.
An answer is faithful if every factual claim it makes can be traced back to the source content.

## Source Documents
${sourceContent}

## Question
${question}

## Answer to Evaluate
${answer}

## Scoring Rubric (1-5 scale)

5 — FULLY FAITHFUL: Every single claim in the answer is directly supported by the source documents. No extrapolation.
4 — MOSTLY FAITHFUL: All major claims are supported. Minor phrasing differences that don't change meaning.
3 — PARTIALLY FAITHFUL: Core claims are supported but the answer adds 1-2 unsupported details or makes minor inferences not in the source.
2 — MOSTLY UNFAITHFUL: Several claims are not in the sources. The answer mixes grounded facts with invented details.
1 — HALLUCINATED: The answer contains major claims that directly contradict or are completely absent from the source documents.

## Calibration Examples (to prevent leniency bias)

- If the source says "30-day refund policy" and the answer says "90-day refund policy" → score 1 (factual error from sources)
- If the source says "supports PostgreSQL and MySQL" and the answer adds "and SQLite" without source support → score 3
- If the answer rephrases source content accurately but in different words → score 5
- If the answer says "typically takes 2-3 days" when the source says nothing about timing → score 2

## Required Output Format (JSON)

Respond with ONLY this JSON object, no other text:
{
  "score": <number 1-5>,
  "justification": "<one sentence explaining the score>",
  "unsupported_claims": ["<list any claims not found in sources, empty array if none>"]
}`;
}

/**
 * Build the relevance scoring prompt.
 * Checks: does the answer actually address the question asked?
 */
export function buildRelevancePrompt({ question, answer, expectedAnswer }) {
  return `You are a strict relevance evaluator for a RAG (Retrieval-Augmented Generation) system.

Your job: determine whether the answer ACTUALLY ADDRESSES the question that was asked.
An answer can be factually correct but completely irrelevant if it doesn't answer what was asked.

## Question
${question}

## Expected Answer (ground truth)
${expectedAnswer}

## Answer to Evaluate
${answer}

## Scoring Rubric (1-5 scale)

5 — PERFECTLY RELEVANT: Directly and completely answers the question. Addresses exactly what was asked.
4 — MOSTLY RELEVANT: Answers the question but includes some tangential information, or slightly misses one aspect of a multi-part question.
3 — PARTIALLY RELEVANT: Addresses the topic but doesn't directly answer the specific question. May answer a related but different question.
2 — MARGINALLY RELEVANT: Touches on the same topic area but largely fails to address what was actually asked. Mostly tangential.
1 — IRRELEVANT: Does not address the question at all. Discusses unrelated topics or provides generic/boilerplate text.

## Calibration Examples

- Question: "What is the refund policy?" Answer: "Our refund policy allows returns within 30 days..." → score 5
- Question: "What is the refund policy?" Answer: "We value our customers and strive for satisfaction. Contact support for any issues." → score 2 (vague, doesn't answer)
- Question: "How do I reset my password?" Answer: "Password security is important. Use strong passwords with special characters." → score 1 (doesn't answer the how)
- Question: "What databases are supported?" Answer: "PostgreSQL and MySQL are supported." (but expected answer includes 5 more) → score 3 (partial)

## Required Output Format (JSON)

Respond with ONLY this JSON object, no other text:
{
  "score": <number 1-5>,
  "justification": "<one sentence explaining the score>"
}`;
}

/**
 * Build the completeness scoring prompt.
 * Checks: did the answer cover all key points from the expected answer?
 */
export function buildCompletenessPrompt({ question, answer, expectedAnswer, keyPoints }) {
  return `You are a strict completeness evaluator for a RAG (Retrieval-Augmented Generation) system.

Your job: determine whether the answer covers ALL the key points that a correct, complete answer should include.

## Question
${question}

## Expected Answer (ground truth)
${expectedAnswer}

## Key Points That Must Be Covered
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Answer to Evaluate
${answer}

## Scoring Rubric (1-5 scale)

5 — FULLY COMPLETE: Covers ALL key points listed above. Nothing important is missing.
4 — MOSTLY COMPLETE: Covers 75%+ of key points. Missing 1-2 minor details.
3 — PARTIALLY COMPLETE: Covers 50-75% of key points. Missing several important details.
2 — MOSTLY INCOMPLETE: Covers 25-50% of key points. Major gaps in the answer.
1 — SEVERELY INCOMPLETE: Covers <25% of key points or provides only a superficial response.

## Calibration Examples

- If there are 6 key points and the answer covers all 6 → score 5
- If there are 6 key points and the answer covers 5, missing a minor detail → score 4
- If there are 6 key points and the answer covers 3 → score 3
- If there are 6 key points and the answer only mentions 1 → score 1

## Required Output Format (JSON)

Respond with ONLY this JSON object, no other text:
{
  "score": <number 1-5>,
  "justification": "<one sentence explaining the score>",
  "covered_points": ["<list key points that ARE covered>"],
  "missing_points": ["<list key points that are MISSING>"]
}`;
}

/**
 * Parse an LLM judge response into a structured score object.
 * Handles common issues: markdown code fences, extra text around JSON.
 */
export function parseJudgeResponse(rawResponse) {
  try {
    // Strip markdown code fences if present
    let cleaned = rawResponse.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    // Try to find JSON object in the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        score: 0,
        justification: 'Failed to parse judge response — no JSON found',
        parseError: true,
        rawResponse,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate score is in range
    if (typeof parsed.score !== 'number' || parsed.score < 1 || parsed.score > 5) {
      return {
        score: 0,
        justification: `Invalid score value: ${parsed.score}`,
        parseError: true,
        rawResponse,
      };
    }

    return { ...parsed, parseError: false };
  } catch (err) {
    return {
      score: 0,
      justification: `JSON parse error: ${err.message}`,
      parseError: true,
      rawResponse,
    };
  }
}

/**
 * All three evaluation dimensions bundled for easy iteration.
 */
export const DIMENSIONS = [
  {
    name: 'faithfulness',
    description: 'Is every claim grounded in the source documents?',
    buildPrompt: buildFaithfulnessPrompt,
  },
  {
    name: 'relevance',
    description: 'Does the answer address the question asked?',
    buildPrompt: buildRelevancePrompt,
  },
  {
    name: 'completeness',
    description: 'Does the answer cover all key points?',
    buildPrompt: buildCompletenessPrompt,
  },
];
