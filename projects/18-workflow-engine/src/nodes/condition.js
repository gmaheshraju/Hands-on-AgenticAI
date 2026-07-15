/**
 * Conditional branching node.
 *
 * Evaluates a condition against the input data and returns which branch to take.
 * The engine uses the branch result to decide which downstream edges to follow.
 */

/**
 * Resolve a dotted field path from an object.
 */
function resolveField(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

/**
 * Evaluate a single condition.
 */
function evaluateCondition(value, operator, expected) {
  switch (operator) {
    case 'eq':  return value === expected;
    case 'neq': return value !== expected;
    case 'gt':  return value > expected;
    case 'gte': return value >= expected;
    case 'lt':  return value < expected;
    case 'lte': return value <= expected;
    case 'in':  return Array.isArray(expected) && expected.includes(value);
    case 'contains': return typeof value === 'string' && value.includes(expected);
    case 'exists':   return value !== undefined && value !== null;
    case 'truthy':   return !!value;
    default: throw new Error(`Unknown operator: ${operator}`);
  }
}

/**
 * Execute a condition node.
 *
 * Config:
 *   - field: string — dotted path to the field to check
 *   - operator: string — comparison operator
 *   - value: any — expected value
 *   - branches: { true: nodeId, false: nodeId } — which nodes to activate
 *
 * Returns the input with a _branch field indicating which path was taken.
 */
export async function executeConditionNode(config, input) {
  const { field, operator = 'eq', value, branches } = config;

  if (!field) throw new Error('Condition node requires a "field" in config');
  if (!branches) throw new Error('Condition node requires "branches" in config');

  const actual = resolveField(input, field);
  const result = evaluateCondition(actual, operator, value);
  const branchTaken = result ? 'true' : 'false';
  const targetNode = branches[branchTaken];

  return {
    ...input,
    _condition: {
      field,
      operator,
      expected: value,
      actual,
      result,
      branchTaken,
      targetNode,
    },
  };
}
