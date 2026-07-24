/**
 * CRM Agent — interprets user commands, stores interactions,
 * retrieves relevant memories, and generates responses.
 *
 * Commands (natural language):
 *   "met X at Y, they work on Z"     → store interaction + trigger consolidation
 *   "who knows about X?"             → semantic search for expertise
 *   "what do I know about X?"        → retrieve all facts about a person/company
 *   "prep me for my call with X"     → pull person profile + recent context
 *   "stats"                          → memory statistics
 *   "facts"                          → list all semantic facts
 *   "health"                         → memory health report (decay, contradictions)
 *   "forget fact N"                  → soft-delete a fact by ID
 *   "reinforce fact N"               → boost a fact back to full confidence
 *   "decay"                          → run temporal decay cycle
 *   "compress"                       → run memory compression
 */

import { MemoryStore } from "./memory.js";
import { runConsolidation } from "./consolidation.js";
import { retrieve, retrievePerson } from "./retrieval.js";

export class CRMAgent {
  constructor(options = {}) {
    this.memory = options.memory || new MemoryStore(options.dbPath);
    this.consolidationThreshold = options.consolidationThreshold || 5;
    this.llm = options.llm || null; // null = use mock
    this.verbose = options.verbose || false;
  }

  /**
   * Process a user message and return a response.
   */
  async processMessage(input) {
    const trimmed = input.trim();
    if (!trimmed) return "I didn't catch that. Try telling me about someone you met.";

    const intent = this.classifyIntent(trimmed);
    let response;

    switch (intent.type) {
      case "log_interaction":
        response = await this.handleLogInteraction(trimmed);
        break;
      case "query_person":
        response = await this.handleQueryPerson(intent.subject, trimmed);
        break;
      case "query_topic":
        response = await this.handleQueryTopic(trimmed);
        break;
      case "call_prep":
        response = await this.handleCallPrep(intent.subject);
        break;
      case "stats":
        response = this.handleStats();
        break;
      case "facts":
        response = this.handleListFacts();
        break;
      case "health":
        response = this.handleHealth();
        break;
      case "forget_fact":
        response = this.handleForgetFact(intent.factId);
        break;
      case "reinforce_fact":
        response = this.handleReinforceFact(intent.factId);
        break;
      case "decay":
        response = this.handleDecay();
        break;
      case "compress":
        response = this.handleCompress();
        break;
      case "help":
        response = this.handleHelp();
        break;
      default:
        response = await this.handleGeneral(trimmed);
    }

    // Only store interactions that carry new information as episodes.
    // Queries (who knows about X?) and commands (stats, facts, help) are
    // read-only — storing them would pollute the consolidation pipeline
    // with noise (the extractor would try to parse "who" or "what" as people).
    const storeableIntents = new Set(["log_interaction", "general"]);
    if (storeableIntents.has(intent.type)) {
      this.memory.addEpisode(trimmed, response, { intent: intent.type });
      await this.maybeConsolidate();
    }

    return response;
  }

  // ─── Intent Classification ──────────────────────────────────────────

  classifyIntent(input) {
    const lower = input.toLowerCase();

    if (lower === "stats" || lower === "status") {
      return { type: "stats" };
    }
    if (lower === "facts" || lower === "list facts") {
      return { type: "facts" };
    }
    if (lower === "health" || lower === "memory health") {
      return { type: "health" };
    }
    if (lower === "decay" || lower === "run decay") {
      return { type: "decay" };
    }
    if (lower === "compress" || lower === "run compression") {
      return { type: "compress" };
    }
    if (lower === "help" || lower === "?") {
      return { type: "help" };
    }

    // "forget fact 42"
    const forgetMatch = lower.match(/forget\s+fact\s+(\d+)/);
    if (forgetMatch) {
      return { type: "forget_fact", factId: parseInt(forgetMatch[1], 10) };
    }

    // "reinforce fact 42"
    const reinforceMatch = lower.match(/reinforce\s+fact\s+(\d+)/);
    if (reinforceMatch) {
      return { type: "reinforce_fact", factId: parseInt(reinforceMatch[1], 10) };
    }

    // "prep me for call with X" / "prepare for meeting with X"
    const prepMatch = lower.match(
      /(?:prep|prepare)\s+(?:me\s+)?(?:for\s+)?(?:my\s+)?(?:call|meeting|chat)\s+with\s+(\w+(?:\s+\w+)?)/i
    );
    if (prepMatch) {
      return { type: "call_prep", subject: prepMatch[1].trim() };
    }

    // "what do I know about X" / "tell me about X" / "who is X"
    const aboutMatch = lower.match(
      /(?:what\s+do\s+i\s+know\s+about|tell\s+me\s+about|who\s+is|info\s+on|details\s+on)\s+(\w+(?:\s+\w+)?)/i
    );
    if (aboutMatch) {
      return { type: "query_person", subject: aboutMatch[1].trim() };
    }

    // "who knows about X" / "who works on X" / "who has experience with X"
    const whoMatch = lower.match(
      /who\s+(?:knows?\s+about|works?\s+on|has\s+experience\s+with|is\s+into)\s+(.+)/i
    );
    if (whoMatch) {
      return { type: "query_topic", subject: whoMatch[1].trim() };
    }

    // "met X at/from/during..." — logging an interaction
    if (
      lower.startsWith("met ") ||
      lower.startsWith("talked to ") ||
      lower.startsWith("spoke with ") ||
      lower.startsWith("had a call with ") ||
      lower.startsWith("chatted with ") ||
      lower.includes("introduced me to") ||
      lower.includes("works at") ||
      lower.includes("moved to") ||
      lower.includes("joined") ||
      lower.includes("now at")
    ) {
      return { type: "log_interaction" };
    }

    // Default: treat as a general query
    return { type: "general" };
  }

  // ─── Handlers ───────────────────────────────────────────────────────

  async handleLogInteraction(input) {
    // Run a quick extraction to give immediate feedback
    const names = this.extractNames(input);
    const nameList = names.length > 0 ? names.join(", ") : "the person";

    let response = `Got it! I've logged your interaction about ${nameList}.`;

    const unconsolidated = this.memory.countUnconsolidated();
    if (unconsolidated + 1 >= this.consolidationThreshold) {
      response += ` I have ${unconsolidated + 1} new episodes — consolidation will run to distill new facts.`;
    }

    return response;
  }

  async handleQueryPerson(subject, _fullInput) {
    const profile = retrievePerson(this.memory, subject);

    if (profile.facts.length === 0 && profile.recentInteractions.length === 0) {
      return `I don't have any information about "${subject}" yet. Tell me about them!`;
    }

    let response = `Here's what I know about ${subject}:\n`;

    if (profile.facts.length > 0) {
      response += "\nFacts:\n";
      for (const f of profile.facts) {
        const staleTag = f.stale ? " [STALE]" : "";
        const confTag =
          f.confidence < 0.8 ? ` (confidence: ${(f.confidence * 100).toFixed(0)}%)` : "";
        response += `  - ${formatPredicate(f.predicate)}: ${f.value}${confTag}${staleTag}\n`;
      }
    }

    if (profile.recentInteractions.length > 0) {
      response += "\nRecent interactions:\n";
      for (const i of profile.recentInteractions) {
        response += `  - [${i.date}] ${i.summary}\n`;
      }
    }

    return response;
  }

  async handleQueryTopic(input) {
    const results = retrieve(this.memory, input, { topK: 10 });

    if (results.length === 0) {
      return `I couldn't find anyone related to "${input}". Log more interactions and I'll learn!`;
    }

    let response = `Search results for "${input}":\n\n`;

    // Group semantic facts by person
    const people = new Map();
    const otherResults = [];

    for (const r of results) {
      if (r.source === "semantic") {
        const name = r.data.subject;
        if (!people.has(name)) people.set(name, []);
        people.get(name).push(r);
      } else {
        otherResults.push(r);
      }
    }

    if (people.size > 0) {
      response += "People:\n";
      for (const [name, facts] of people) {
        const factStrs = facts
          .map(
            (f) => `${formatPredicate(f.data.predicate)}: ${f.data.object}`
          )
          .join("; ");
        response += `  - ${name} — ${factStrs}\n`;
      }
    }

    if (otherResults.length > 0) {
      response += "\nRelated interactions:\n";
      for (const r of otherResults.slice(0, 5)) {
        response += `  - ${r.summary}\n`;
      }
    }

    return response;
  }

  async handleCallPrep(person) {
    const profile = retrievePerson(this.memory, person);

    if (profile.facts.length === 0 && profile.recentInteractions.length === 0) {
      return `I don't have enough info about ${person} to prep you. Tell me about them first.`;
    }

    let response = `Call prep for ${person}:\n`;
    response += "═".repeat(40) + "\n";

    // Profile section
    if (profile.facts.length > 0) {
      response += "\nProfile:\n";
      const company = profile.facts.find((f) => f.predicate === "company");
      const role = profile.facts.find((f) => f.predicate === "role");
      const interests = profile.facts.filter(
        (f) =>
          f.predicate === "interested_in" || f.predicate === "mentioned_topic"
      );

      if (company) response += `  Company: ${company.value}\n`;
      if (role) response += `  Role: ${role.value}\n`;

      const otherFacts = profile.facts.filter(
        (f) =>
          !["company", "role", "interested_in", "mentioned_topic"].includes(
            f.predicate
          )
      );
      for (const f of otherFacts) {
        response += `  ${formatPredicate(f.predicate)}: ${f.value}\n`;
      }

      if (interests.length > 0) {
        response +=
          "\n  Topics of interest: " +
          interests.map((i) => i.value).join(", ") +
          "\n";
      }
    }

    // Recent context
    if (profile.recentInteractions.length > 0) {
      response += "\nRecent context:\n";
      for (const i of profile.recentInteractions.slice(0, 3)) {
        response += `  - [${i.date}] ${i.summary}\n`;
      }
    }

    // Talking points
    response += "\nSuggested talking points:\n";
    const topics = profile.facts
      .filter(
        (f) =>
          f.predicate === "interested_in" ||
          f.predicate === "mentioned_topic" ||
          f.predicate === "expertise"
      )
      .map((f) => f.value);

    if (topics.length > 0) {
      for (const t of [...new Set(topics)]) {
        response += `  - Ask about their work on ${t}\n`;
      }
    } else {
      response += "  - Follow up on your last conversation\n";
      response += "  - Ask what they're currently working on\n";
    }

    return response;
  }

  handleStats() {
    const stats = this.memory.getStats();
    return [
      "Memory Statistics:",
      `  Episodes:       ${stats.episodes} (${stats.unconsolidated} pending consolidation)`,
      `  Semantic facts: ${stats.facts} (${stats.staleFacts} stale, ${stats.archivedFacts} archived)`,
      `  Procedures:     ${stats.procedures}`,
      `  Consolidation:  triggers at ${this.consolidationThreshold} unconsolidated episodes`,
    ].join("\n");
  }

  handleHealth() {
    const health = this.memory.getMemoryHealth();
    const dist = health.confidenceDistribution;
    return [
      "Memory Health Report:",
      `  Active facts:          ${health.total}`,
      `  Stale facts:           ${health.stale}`,
      `  Archived facts:        ${health.archived}`,
      `  Active contradictions: ${health.contradictions}`,
      `  Compression targets:   ${health.compressionOpportunities} subjects with 5+ facts`,
      "",
      "  Confidence distribution:",
      `    [0.00 - 0.25)  ${"█".repeat(dist["0.00-0.25"])} ${dist["0.00-0.25"]}`,
      `    [0.25 - 0.50)  ${"█".repeat(dist["0.25-0.50"])} ${dist["0.25-0.50"]}`,
      `    [0.50 - 0.75)  ${"█".repeat(dist["0.50-0.75"])} ${dist["0.50-0.75"]}`,
      `    [0.75 - 1.00]  ${"█".repeat(Math.min(dist["0.75-1.00"], 40))} ${dist["0.75-1.00"]}`,
    ].join("\n");
  }

  handleForgetFact(id) {
    const result = this.memory.forgetFact(id);
    if (!result.success) {
      return `Could not forget fact #${id}: ${result.reason}`;
    }
    return `Forgotten: ${result.forgotten.subject} — ${result.forgotten.predicate}: ${result.forgotten.object}`;
  }

  handleReinforceFact(id) {
    const result = this.memory.reinforceFact(id);
    if (!result.success) {
      return `Could not reinforce fact #${id}: ${result.reason}`;
    }
    return `Reinforced: ${result.reinforced.subject} — ${result.reinforced.predicate}: ${result.reinforced.object} (confidence reset to 1.0)`;
  }

  handleDecay() {
    const result = this.memory.decayMemories();
    return [
      "Temporal decay applied:",
      `  Decayed:    ${result.decayed} facts (confidence reduced)`,
      `  Archived:   ${result.archived} facts (below threshold, soft-deleted)`,
      `  Untouched:  ${result.untouched} facts (still fresh)`,
    ].join("\n");
  }

  handleCompress() {
    const result = this.memory.compressMemories();
    let response = [
      "Memory compression complete:",
      `  Merged:   ${result.merged} fact pairs`,
      `  Removed:  ${result.removed} redundant facts (archived)`,
    ].join("\n");

    if (result.compressed.length > 0) {
      response += "\n\n  Merges:\n";
      for (const c of result.compressed) {
        response += `    ${c.subject} — ${c.predicate}: kept "${c.kept.value}", dropped "${c.dropped.value}"\n`;
      }
    }

    return response;
  }

  handleListFacts() {
    const facts = this.memory.getAllFacts();
    if (facts.length === 0) {
      return "No semantic facts stored yet. Log some interactions first!";
    }

    let response = `All known facts (${facts.length}):\n\n`;
    const byPerson = new Map();
    for (const f of facts) {
      if (!byPerson.has(f.subject)) byPerson.set(f.subject, []);
      byPerson.get(f.subject).push(f);
    }

    for (const [person, personFacts] of byPerson) {
      response += `${person}:\n`;
      for (const f of personFacts) {
        const staleTag = f.stale ? " [STALE]" : "";
        const confTag =
          f.confidence < 0.8 ? ` (${(f.confidence * 100).toFixed(0)}%)` : "";
        response += `  - [#${f.id}] ${formatPredicate(f.predicate)}: ${f.object}${confTag}${staleTag}\n`;
      }
      response += "\n";
    }

    return response;
  }

  handleHelp() {
    return [
      "Personal CRM Agent — Commands:",
      "",
      '  met [person] at [place], they [details]  — Log an interaction',
      '  who knows about [topic]?                 — Find people by topic',
      '  what do I know about [person]?            — Get person profile',
      '  prep me for my call with [person]         — Call preparation brief',
      '  [person] moved to [company]               — Update facts',
      "  stats                                     — Memory statistics",
      "  facts                                     — List all known facts",
      "  health                                    — Memory health report",
      "  decay                                     — Run temporal decay cycle",
      "  compress                                  — Run memory compression",
      "  forget fact [id]                           — Soft-delete a fact",
      "  reinforce fact [id]                        — Boost fact confidence to 1.0",
      "  help                                      — This message",
      "  exit / quit                               — Exit",
    ].join("\n");
  }

  async handleGeneral(input) {
    // Try to find relevant memories for any unclassified input
    const results = retrieve(this.memory, input, { topK: 5 });

    if (results.length === 0) {
      return "I'm not sure what to do with that. Type 'help' for available commands.";
    }

    let response = "Here's what I found that might be relevant:\n\n";
    for (const r of results) {
      response += `  ${r.summary}\n`;
    }
    return response;
  }

  // ─── Consolidation ──────────────────────────────────────────────────

  async maybeConsolidate() {
    const result = await runConsolidation(this.memory, {
      threshold: this.consolidationThreshold,
      llm: this.llm,
    });

    if (result.ran && this.verbose) {
      console.log(
        `[Consolidation] Processed ${result.episodesProcessed} episodes, extracted ${result.factsExtracted.length} facts`
      );
      for (const f of result.factsExtracted) {
        const tag = f.action === "updated" ? "UPDATED"
          : f.action === "contradiction_resolved" ? "CONTRADICTION"
          : "NEW";
        console.log(
          `  [${tag}] ${f.subject} — ${f.predicate}: ${f.object}`
        );
        if (f.previous) {
          console.log(`         (was: ${f.previous})`);
        }
        if (f.resolution) {
          console.log(`         (resolution: ${f.resolution})`);
        }
      }
    }

    return result;
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  extractNames(text) {
    // Simple heuristic: capitalized words that aren't common English words
    const commonWords = new Set([
      "I", "Met", "The", "She", "He", "They", "We", "At", "In", "On",
      "For", "To", "And", "Or", "But", "Had", "Has", "Was", "Is",
      "Our", "Their", "My", "About", "With", "From", "Into",
      "Got", "Talked", "Spoke", "Call",
    ]);

    const words = text.match(/\b[A-Z][a-z]+\b/g) || [];
    return [...new Set(words.filter((w) => !commonWords.has(w)))];
  }

  getStats() {
    return this.memory.getStats();
  }

  close() {
    this.memory.close();
  }
}

// ─── Formatting helpers ─────────────────────────────────────────────────

function formatPredicate(pred) {
  return pred
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
