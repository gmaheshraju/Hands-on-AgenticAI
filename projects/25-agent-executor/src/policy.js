export class PolicyEngine {
  constructor() {
    this.policies = new Map();
    this.rolePolicies = new Map();
    this.defaults = { effect: 'deny' };
  }

  addPolicy(policy) {
    const id = policy.id || `pol_${this.policies.size + 1}`;
    const record = {
      id,
      name: policy.name,
      effect: policy.effect, // 'allow' | 'deny'
      principals: policy.principals || ['*'],
      actions: policy.actions || ['*'],
      resources: policy.resources || ['*'],
      conditions: policy.conditions || {},
      priority: policy.priority || 0,
    };
    this.policies.set(id, record);
    return record;
  }

  addRole(roleId, policyIds) {
    this.rolePolicies.set(roleId, policyIds);
  }

  evaluate(request) {
    const { principal, action, resource, context = {} } = request;
    const applicablePolicies = this._findApplicable(principal, action, resource);

    if (applicablePolicies.length === 0) {
      return { allowed: false, reason: 'no_matching_policy', matchedPolicies: [] };
    }

    const sorted = applicablePolicies.sort((a, b) => b.priority - a.priority);

    for (const policy of sorted) {
      if (policy.effect === 'deny') {
        const conditionsMet = this._checkConditions(policy.conditions, context);
        if (conditionsMet) {
          return { allowed: false, reason: 'explicit_deny', policy: policy.id, policyName: policy.name, matchedPolicies: sorted.map(p => p.id) };
        }
      }
    }

    for (const policy of sorted) {
      if (policy.effect === 'allow') {
        const conditionsMet = this._checkConditions(policy.conditions, context);
        if (conditionsMet) {
          return { allowed: true, reason: 'explicit_allow', policy: policy.id, policyName: policy.name, matchedPolicies: sorted.map(p => p.id) };
        }
      }
    }

    return { allowed: false, reason: 'no_allow_policy', matchedPolicies: sorted.map(p => p.id) };
  }

  _findApplicable(principal, action, resource) {
    const results = [];
    const principalRoles = this._getPrincipalRoles(principal);
    const allPolicyIds = new Set();

    for (const role of principalRoles) {
      const policyIds = this.rolePolicies.get(role) || [];
      for (const id of policyIds) allPolicyIds.add(id);
    }

    for (const [id, policy] of this.policies) {
      const principalMatch = this._matchPattern(principal, policy.principals) ||
        principalRoles.some(r => this._matchPattern(r, policy.principals)) ||
        allPolicyIds.has(id);
      const actionMatch = this._matchPattern(action, policy.actions);
      const resourceMatch = this._matchPattern(resource, policy.resources);

      if (principalMatch && actionMatch && resourceMatch) {
        results.push(policy);
      }
    }
    return results;
  }

  _getPrincipalRoles(principal) {
    const roles = [];
    for (const [role, policyIds] of this.rolePolicies) {
      roles.push(role);
    }
    return roles;
  }

  _matchPattern(value, patterns) {
    return patterns.some(pattern => {
      if (pattern === '*') return true;
      if (pattern === value) return true;
      if (pattern.endsWith('*')) {
        return value.startsWith(pattern.slice(0, -1));
      }
      return false;
    });
  }

  _checkConditions(conditions, context) {
    for (const [key, rule] of Object.entries(conditions)) {
      const contextValue = context[key];

      if (rule.equals !== undefined && contextValue !== rule.equals) return false;
      if (rule.notEquals !== undefined && contextValue === rule.notEquals) return false;
      if (rule.in !== undefined && !rule.in.includes(contextValue)) return false;
      if (rule.notIn !== undefined && rule.notIn.includes(contextValue)) return false;
      if (rule.lessThan !== undefined && (contextValue === undefined || contextValue >= rule.lessThan)) return false;
      if (rule.greaterThan !== undefined && (contextValue === undefined || contextValue <= rule.greaterThan)) return false;
      if (rule.exists !== undefined && rule.exists !== (contextValue !== undefined)) return false;
      if (rule.matches !== undefined && !new RegExp(rule.matches).test(contextValue)) return false;
    }
    return true;
  }

  listPolicies() {
    return [...this.policies.values()];
  }
}
