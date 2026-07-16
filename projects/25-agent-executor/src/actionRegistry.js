export class ActionRegistry {
  constructor() {
    this.actions = new Map();
    this.categories = new Map();
  }

  register(action) {
    const record = {
      id: action.id,
      name: action.name,
      category: action.category || 'general',
      riskLevel: action.riskLevel || 'low', // 'low' | 'medium' | 'high' | 'critical'
      requiresApproval: action.requiresApproval || false,
      schema: action.schema || null,
      handler: action.handler,
      timeout: action.timeout || 30000,
      retryable: action.retryable !== false,
      maxRetries: action.maxRetries || 2,
      reversible: action.reversible || false,
      reverseHandler: action.reverseHandler || null,
      description: action.description || '',
    };

    this.actions.set(action.id, record);

    if (!this.categories.has(record.category)) {
      this.categories.set(record.category, []);
    }
    this.categories.get(record.category).push(action.id);

    return record;
  }

  get(actionId) {
    return this.actions.get(actionId);
  }

  validate(actionId, params) {
    const action = this.actions.get(actionId);
    if (!action) return { valid: false, error: `Unknown action: ${actionId}` };

    if (!action.schema) return { valid: true };

    const errors = [];
    const schema = action.schema;

    if (schema.required) {
      for (const field of schema.required) {
        if (params[field] === undefined || params[field] === null) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    if (schema.properties) {
      for (const [field, rules] of Object.entries(schema.properties)) {
        const value = params[field];
        if (value === undefined) continue;

        if (rules.type === 'string' && typeof value !== 'string') {
          errors.push(`${field} must be a string`);
        }
        if (rules.type === 'number' && typeof value !== 'number') {
          errors.push(`${field} must be a number`);
        }
        if (rules.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`${field} must be a boolean`);
        }
        if (rules.enum && !rules.enum.includes(value)) {
          errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
        }
        if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
          errors.push(`${field} exceeds max length ${rules.maxLength}`);
        }
        if (rules.minimum !== undefined && typeof value === 'number' && value < rules.minimum) {
          errors.push(`${field} must be >= ${rules.minimum}`);
        }
        if (rules.maximum !== undefined && typeof value === 'number' && value > rules.maximum) {
          errors.push(`${field} must be <= ${rules.maximum}`);
        }
        if (rules.pattern && typeof value === 'string' && !new RegExp(rules.pattern).test(value)) {
          errors.push(`${field} does not match pattern: ${rules.pattern}`);
        }
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  listByCategory(category) {
    const actionIds = this.categories.get(category) || [];
    return actionIds.map(id => this.actions.get(id));
  }

  listByRisk(riskLevel) {
    return [...this.actions.values()].filter(a => a.riskLevel === riskLevel);
  }

  summary() {
    const byCategory = {};
    const byRisk = { low: 0, medium: 0, high: 0, critical: 0 };

    for (const action of this.actions.values()) {
      byCategory[action.category] = (byCategory[action.category] || 0) + 1;
      byRisk[action.riskLevel]++;
    }

    return { totalActions: this.actions.size, byCategory, byRisk };
  }
}
