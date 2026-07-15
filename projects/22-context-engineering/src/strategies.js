// strategies.js — Different context assembly strategies

import { sortByPriority, sortByRelevance, groupByType, totalTokens } from './sources.js';

/**
 * Greedy strategy: fill highest priority first, drop lowest when over budget.
 * System prompts always included. Then fill in strict priority order.
 */
export function greedy(sources, budget) {
  // sortByPriority already handles this — budget.allocate uses it
  return budget.allocate(sources);
}

/**
 * Relevance strategy: sort ALL sources by relevance score (ignoring type priority),
 * except system prompts which are always first.
 * Best when you have good relevance scores and want to maximize signal density.
 */
export function relevance(sources, budget) {
  const system = sources.filter(s => s.type.priority === 0);
  const nonSystem = sources.filter(s => s.type.priority !== 0);

  // Sort non-system sources purely by relevance
  const byRelevance = sortByRelevance(nonSystem);

  // Reassign effective priorities based on relevance rank
  // System stays at 0, then each source gets priority 1..N by relevance rank
  const reranked = [
    ...system,
    ...byRelevance.map((s, i) => ({
      ...s,
      type: { ...s.type, priority: i + 1 },
    })),
  ];

  return budget.allocate(reranked);
}

/**
 * Balanced strategy: allocate proportional budget to each source type,
 * then fill by relevance within each type.
 * Ensures representation from every source category.
 */
export function balanced(sources, budget) {
  const system = sources.filter(s => s.type.priority === 0);
  const nonSystem = sources.filter(s => s.type.priority !== 0);

  // Calculate system token cost
  const systemTokens = totalTokens(system);
  const remainingBudget = budget.available - systemTokens;

  // Group non-system sources by type
  const groups = groupByType(nonSystem);
  const typeCount = Object.keys(groups).length;

  if (typeCount === 0) {
    return budget.allocate(system);
  }

  // Allocate budget proportionally based on total tokens per type
  // (types with more content get more budget, but capped at their actual need)
  const totalNonSystem = totalTokens(nonSystem);
  const typeAllocations = {};

  for (const [typeName, typeSources] of Object.entries(groups)) {
    const typeTokens = totalTokens(typeSources);
    const proportion = typeTokens / totalNonSystem;
    typeAllocations[typeName] = Math.floor(remainingBudget * proportion);
  }

  // Build reranked list: system first, then within each type sorted by relevance,
  // with effective priorities set to fit within type allocations
  const reranked = [...system];
  let priorityCounter = 1;

  // Process types in their natural priority order
  const sortedTypeNames = Object.entries(groups)
    .sort(([, a], [, b]) => a[0].type.priority - b[0].type.priority)
    .map(([name]) => name);

  for (const typeName of sortedTypeNames) {
    const typeSources = groups[typeName];
    const typeAllocation = typeAllocations[typeName];
    let typeUsed = 0;

    // Sort sources within this type by relevance
    const sorted = sortByRelevance(typeSources);

    for (const source of sorted) {
      if (typeUsed + source.tokens <= typeAllocation) {
        reranked.push({ ...source, type: { ...source.type, priority: priorityCounter } });
        typeUsed += source.tokens;
      } else if (typeUsed < typeAllocation) {
        // Partial fit
        reranked.push({ ...source, type: { ...source.type, priority: priorityCounter } });
        typeUsed += source.tokens; // Will be truncated by budget.allocate
      } else {
        // Over type budget — push with high priority so it gets dropped
        reranked.push({ ...source, type: { ...source.type, priority: 100 + priorityCounter } });
      }
      priorityCounter++;
    }
  }

  return budget.allocate(reranked);
}

/**
 * All available strategies.
 */
export const strategies = { greedy, relevance, balanced };
