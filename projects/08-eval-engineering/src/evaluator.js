/**
 * LLM-as-Judge evaluator.
 *
 * Core pattern: send a structured rubric prompt to an LLM, get back
 * calibrated scores with justifications. The rubric includes concrete
 * failure examples to combat the well-known leniency bias where LLMs
 * rate everything 4-5/5.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  buildFaithfulnessPrompt,
  buildRelevancePrompt,
  buildCompletenessPrompt,
  parseJudgeResponse,
} from './dimensions.js';

/**
 * Create a judge backed by Gemini.
 * Returns a function that scores a single RAG response across all dimensions.
 */
export function createJudge(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.1, // Low temperature for consistent scoring
      maxOutputTokens: 1024,
    },
  });

  /**
   * Call the LLM judge with a single prompt and parse the response.
   */
  async function judgeCall(prompt) {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseJudgeResponse(text);
  }

  /**
   * Evaluate a single RAG response across all three dimensions.
   *
   * @param {Object} params
   * @param {string} params.question       - The user's question
   * @param {string} params.answer         - The RAG system's answer
   * @param {string} params.expectedAnswer - Ground truth answer
   * @param {string} params.sourceContent  - The source documents' content
   * @param {string[]} params.keyPoints    - Key points the answer should cover
   * @returns {Object} Scores for each dimension
   */
  async function evaluate({ question, answer, expectedAnswer, sourceContent, keyPoints }) {
    // Run all three dimension evaluations in parallel
    const [faithfulness, relevance, completeness] = await Promise.all([
      judgeCall(buildFaithfulnessPrompt({ question, answer, sourceContent })),
      judgeCall(buildRelevancePrompt({ question, answer, expectedAnswer })),
      judgeCall(buildCompletenessPrompt({ question, answer, expectedAnswer, keyPoints })),
    ]);

    const scores = { faithfulness, relevance, completeness };

    // Compute composite score (weighted average)
    const weights = { faithfulness: 0.4, relevance: 0.3, completeness: 0.3 };
    let composite = 0;
    let validDimensions = 0;

    for (const [dim, weight] of Object.entries(weights)) {
      if (!scores[dim].parseError) {
        composite += scores[dim].score * weight;
        validDimensions++;
      }
    }

    scores.composite = validDimensions > 0
      ? Math.round((composite / (validDimensions > 0 ? 1 : 1)) * 100) / 100
      : 0;

    return scores;
  }

  return { evaluate, judgeCall };
}

/**
 * Create a mock judge for testing without API calls.
 * Compares answer against expected answer using simple heuristics.
 */
export function createMockJudge() {
  function heuristicScore(answer, expectedAnswer, keyPoints) {
    if (!answer || answer.trim().length === 0) {
      return { faithfulness: 1, relevance: 1, completeness: 1 };
    }

    const answerLower = answer.toLowerCase();
    const expectedLower = expectedAnswer.toLowerCase();

    // Simple word overlap for relevance
    const expectedWords = new Set(expectedLower.split(/\s+/).filter(w => w.length > 3));
    const answerWords = new Set(answerLower.split(/\s+/).filter(w => w.length > 3));
    const overlap = [...expectedWords].filter(w => answerWords.has(w)).length;
    const relevanceRatio = expectedWords.size > 0 ? overlap / expectedWords.size : 0;

    // Key points coverage for completeness
    const coveredPoints = keyPoints.filter(point =>
      answerLower.includes(point.toLowerCase().slice(0, 20))
    );
    const completenessRatio = keyPoints.length > 0
      ? coveredPoints.length / keyPoints.length
      : 0;

    return {
      faithfulness: Math.min(5, Math.max(1, Math.round(relevanceRatio * 5))),
      relevance: Math.min(5, Math.max(1, Math.round(relevanceRatio * 5))),
      completeness: Math.min(5, Math.max(1, Math.round(completenessRatio * 5))),
    };
  }

  async function evaluate({ question, answer, expectedAnswer, sourceContent, keyPoints }) {
    const scores = heuristicScore(answer, expectedAnswer, keyPoints);

    return {
      faithfulness: {
        score: scores.faithfulness,
        justification: `Heuristic: word overlap with expected answer`,
        parseError: false,
      },
      relevance: {
        score: scores.relevance,
        justification: `Heuristic: word overlap with expected answer`,
        parseError: false,
      },
      completeness: {
        score: scores.completeness,
        justification: `Heuristic: ${keyPoints.length > 0 ? 'key point coverage check' : 'no key points to check'}`,
        covered_points: keyPoints.filter(p => answer.toLowerCase().includes(p.toLowerCase().slice(0, 20))),
        missing_points: keyPoints.filter(p => !answer.toLowerCase().includes(p.toLowerCase().slice(0, 20))),
        parseError: false,
      },
      composite: Math.round(
        (scores.faithfulness * 0.4 + scores.relevance * 0.3 + scores.completeness * 0.3) * 100
      ) / 100,
    };
  }

  return { evaluate };
}
