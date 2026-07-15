/**
 * Capability Card system — each agent publishes what it can do.
 *
 * A capability card is a structured declaration:
 *   - id: unique agent identifier
 *   - name: human-readable name
 *   - skills: array of { name, inputSchema, outputSchema, cost, latency }
 *   - load: current queue depth (for routing decisions)
 *   - maxConcurrency: how many tasks this agent handles at once
 *   - escalatesTo: agent ID this agent escalates to when stuck
 */

export class CapabilityRegistry {
  constructor() {
    this.agents = new Map();
    this.skillIndex = new Map(); // skillName → [agentId]
  }

  register(card) {
    if (!card.id || !card.name || !Array.isArray(card.skills)) {
      throw new Error(`Invalid capability card: must have id, name, skills`);
    }

    const entry = {
      ...card,
      load: 0,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    this.agents.set(card.id, entry);

    for (const skill of card.skills) {
      if (!this.skillIndex.has(skill.name)) {
        this.skillIndex.set(skill.name, []);
      }
      this.skillIndex.get(skill.name).push(card.id);
    }

    return entry;
  }

  deregister(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    for (const skill of agent.skills) {
      const providers = this.skillIndex.get(skill.name);
      if (providers) {
        const idx = providers.indexOf(agentId);
        if (idx !== -1) providers.splice(idx, 1);
        if (providers.length === 0) this.skillIndex.delete(skill.name);
      }
    }

    this.agents.delete(agentId);
    return true;
  }

  /**
   * Find agents that can handle a given skill.
   * Returns sorted by: lowest load first, then lowest cost.
   */
  findProviders(skillName) {
    const agentIds = this.skillIndex.get(skillName) || [];
    return agentIds
      .map(id => this.agents.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        if (a.load !== b.load) return a.load - b.load;
        const aCost = a.skills.find(s => s.name === skillName)?.cost || 0;
        const bCost = b.skills.find(s => s.name === skillName)?.cost || 0;
        return aCost - bCost;
      });
  }

  /**
   * Select the best agent for a skill. Returns null if none available.
   */
  selectAgent(skillName) {
    const providers = this.findProviders(skillName);
    if (providers.length === 0) return null;

    const best = providers[0];
    if (best.load >= (best.maxConcurrency || 5)) return null;

    return best;
  }

  heartbeat(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) agent.lastHeartbeat = Date.now();
  }

  incrementLoad(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) agent.load++;
  }

  decrementLoad(agentId) {
    const agent = this.agents.get(agentId);
    if (agent && agent.load > 0) agent.load--;
  }

  listAgents() {
    return [...this.agents.values()];
  }

  listSkills() {
    const skills = new Map();
    for (const [name, agentIds] of this.skillIndex) {
      skills.set(name, agentIds.map(id => this.agents.get(id)?.name).filter(Boolean));
    }
    return skills;
  }
}
