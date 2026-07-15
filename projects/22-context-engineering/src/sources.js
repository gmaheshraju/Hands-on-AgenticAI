// sources.js — Define source types with priorities and metadata

import { estimateTokens } from './tokenizer.js';

/**
 * Source type definitions with default priorities.
 * Lower number = higher priority (0 = never dropped).
 */
export const SourceType = {
  SYSTEM_PROMPT:        { name: 'SYSTEM_PROMPT',        priority: 0, label: 'System Prompt' },
  CONVERSATION_HISTORY: { name: 'CONVERSATION_HISTORY', priority: 1, label: 'Conversation' },
  RAG_CHUNKS:           { name: 'RAG_CHUNKS',           priority: 2, label: 'RAG Chunks' },
  MEMORY:               { name: 'MEMORY',               priority: 3, label: 'Memory' },
  TOOL_RESULTS:         { name: 'TOOL_RESULTS',         priority: 4, label: 'Tool Results' },
  EXAMPLES:             { name: 'EXAMPLES',             priority: 5, label: 'Examples' },
};

/**
 * Create a source entry with auto-estimated tokens.
 *
 * @param {object} type - One of SourceType values
 * @param {string} content - The text content
 * @param {object} opts - Optional: { relevanceScore, metadata, id }
 * @returns {object} Source object
 */
export function createSource(type, content, opts = {}) {
  if (!type || !type.name) {
    throw new Error('Invalid source type. Use SourceType.XXX');
  }
  if (typeof content !== 'string') {
    throw new Error('Content must be a string');
  }

  const tokens = estimateTokens(content);
  const relevanceScore = Math.max(0, Math.min(1, opts.relevanceScore ?? 1.0));

  return {
    id: opts.id || `${type.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    content,
    tokens,
    relevanceScore,
    metadata: opts.metadata || {},
  };
}

/**
 * Sort sources by effective priority (type priority first, then relevance within tier).
 * Higher relevance = ranked earlier within the same priority tier.
 */
export function sortByPriority(sources) {
  return [...sources].sort((a, b) => {
    if (a.type.priority !== b.type.priority) {
      return a.type.priority - b.type.priority;
    }
    // Within same priority tier, higher relevance first
    return b.relevanceScore - a.relevanceScore;
  });
}

/**
 * Sort sources purely by relevance score (highest first), ignoring type.
 */
export function sortByRelevance(sources) {
  return [...sources].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Group sources by their type name.
 */
export function groupByType(sources) {
  const groups = {};
  for (const source of sources) {
    const key = source.type.name;
    if (!groups[key]) groups[key] = [];
    groups[key].push(source);
  }
  return groups;
}

/**
 * Calculate total tokens across all sources.
 */
export function totalTokens(sources) {
  return sources.reduce((sum, s) => sum + s.tokens, 0);
}
