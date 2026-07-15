/**
 * Consolidation gate — distills episodic memory into semantic facts.
 *
 * After N unconsolidated episodes accumulate, the gate fires:
 *   1. Gather the unconsolidated episodes
 *   2. Gather existing semantic facts (to detect conflicts / updates)
 *   3. Prompt the LLM to extract new or updated facts
 *   4. Write facts to semantic store, handling conflicts (upsert by subject+predicate)
 *   5. Mark episodes as consolidated
 *
 * In demo mode, a mock LLM extracts facts with simple heuristics.
 */

/**
 * Extract facts from episodes using the LLM (or mock).
 *
 * @param {object[]} episodes — unconsolidated episodic rows
 * @param {object[]} existingFacts — current semantic facts for conflict detection
 * @param {object} options — { llm } where llm is a function(prompt) => string
 * @returns {object[]} — array of { subject, predicate, object, confidence }
 */
export async function extractFacts(episodes, existingFacts, options = {}) {
  const llm = options.llm || mockLLMExtractor;
  return llm(episodes, existingFacts);
}

/**
 * Run one consolidation cycle.
 *
 * @param {import('./memory.js').MemoryStore} memory
 * @param {object} options — { threshold, llm }
 */
export async function runConsolidation(memory, options = {}) {
  const threshold = options.threshold || 5;
  const unconsolidatedCount = memory.countUnconsolidated();

  if (unconsolidatedCount < threshold) {
    return {
      ran: false,
      reason: `Only ${unconsolidatedCount} unconsolidated episodes (threshold: ${threshold})`,
    };
  }

  const episodes = memory.getUnconsolidatedEpisodes(threshold);
  const existingFacts = memory.getAllFacts();
  const newFacts = await extractFacts(episodes, existingFacts, options);

  const results = [];
  for (const fact of newFacts) {
    const result = memory.addFact(
      fact.subject,
      fact.predicate,
      fact.object,
      episodes.map((e) => e.id),
      fact.confidence || 1.0
    );
    results.push({ ...fact, ...result });
  }

  memory.markConsolidated(episodes.map((e) => e.id));

  // Also check for procedural patterns
  const procedures = extractProcedures(episodes);
  for (const proc of procedures) {
    memory.addProcedure(proc.trigger, proc.action, proc.examples);
  }

  return {
    ran: true,
    episodesProcessed: episodes.length,
    factsExtracted: results,
    proceduresLearned: procedures.length,
  };
}

// ─── Mock LLM Extractor ──────────────────────────────────────────────────

/**
 * Heuristic-based fact extractor for demo mode.
 * Parses common CRM patterns from raw text.
 *
 * Key design: every extraction resolves pronouns (she/he/they) back to the
 * primary person name found at the start of the sentence. This prevents
 * facts from being attributed to "she" or "he".
 */
function mockLLMExtractor(episodes, _existingFacts) {
  const facts = [];
  const PRONOUNS = new Set(["she", "he", "they", "her", "him", "their"]);
  const NOISE = new Set([
    "i", "met", "talked", "spoke", "had", "chatted", "who", "what",
    "do", "the", "a", "an", "to", "with", "at", "from", "on",
  ]);

  /**
   * Find the primary person name in a text.
   * Looks for: "met X", "with X", "X from", or first capitalized word
   * that isn't a common English word.
   */
  function findPrimaryPerson(text) {
    // "met/with/to X" where X is a capitalized name
    const explicit = text.match(
      /(?:met|with|to|spoke\s+with|talked\s+to|chatted\s+with)\s+([A-Z][a-z]+)/
    );
    if (explicit) return explicit[1];

    // First capitalized word that isn't a common word or place
    const words = text.split(/\s+/);
    const commonCaps = new Set([
      "Met", "The", "She", "He", "They", "At", "In", "On", "For", "To",
      "And", "Or", "But", "Had", "Has", "Was", "Is", "Our", "Their",
      "My", "About", "With", "From", "Got", "Talked", "Spoke", "Call",
      "KubeCon", "DockerCon", "AWS", "GCP", "I",
    ]);
    for (const w of words) {
      if (/^[A-Z][a-z]+$/.test(w) && !commonCaps.has(w)) return w;
    }
    return null;
  }

  /**
   * Resolve a captured subject: if it's a pronoun, return the primary person.
   * If it's a noise word or too short, return null.
   */
  function resolveSubject(captured, primaryPerson) {
    if (!captured) return primaryPerson;
    const lower = captured.toLowerCase().trim();
    if (PRONOUNS.has(lower)) return primaryPerson;
    if (NOISE.has(lower)) return primaryPerson;
    if (lower.length < 2) return primaryPerson;
    // If it starts with lowercase, it's probably not a name
    if (captured[0] === captured[0].toLowerCase() && !/^[A-Z]/.test(captured)) {
      return primaryPerson;
    }
    return captured.trim();
  }

  for (const ep of episodes) {
    const text = ep.raw_input;
    const primaryPerson = findPrimaryPerson(text);
    if (!primaryPerson) continue; // skip if we can't identify anyone

    // Pattern: "met X at Y" / "met X during Y"
    const metAt = text.match(
      /met\s+(\w+(?:\s+\w+)?)\s+(?:at|during)\s+([^,\.]+)/i
    );
    if (metAt) {
      const person = resolveSubject(metAt[1], primaryPerson);
      if (person) {
        facts.push({
          subject: person,
          predicate: "met_at",
          object: metAt[2].trim(),
          confidence: 0.95,
        });
      }
    }

    // Pattern: "X leads/runs/heads Y at Z"
    const roleAt = text.match(
      /(\w+(?:\s+\w+)?)\s+(?:leads?|runs?|heads?|manages?)\s+([^,\.]+?)\s+at\s+([^,\.]+)/i
    );
    if (roleAt) {
      const person = resolveSubject(roleAt[1], primaryPerson);
      if (person) {
        facts.push({
          subject: person,
          predicate: "role",
          object: `${roleAt[2].trim()} at ${roleAt[3].trim()}`,
          confidence: 0.9,
        });
        facts.push({
          subject: person,
          predicate: "company",
          object: roleAt[3].trim(),
          confidence: 0.9,
        });
      }
    }

    // Pattern: "X works at/for Y" or "X is at Y"
    const worksAt = text.match(
      /(\w+(?:\s+\w+)?)\s+(?:works?\s+(?:at|for)|is\s+at)\s+([^,\.]+)/i
    );
    if (worksAt && !roleAt) {
      const person = resolveSubject(worksAt[1], primaryPerson);
      if (person) {
        facts.push({
          subject: person,
          predicate: "company",
          object: worksAt[2].trim(),
          confidence: 0.85,
        });
      }
    }

    // Pattern: "X from Y" (company association)
    const fromCompany = text.match(
      /(\w+)\s+from\s+([A-Z]\w+)/
    );
    if (fromCompany && !worksAt && !roleAt) {
      const person = resolveSubject(fromCompany[1], primaryPerson);
      if (person) {
        facts.push({
          subject: person,
          predicate: "company",
          object: fromCompany[2].trim(),
          confidence: 0.85,
        });
      }
    }

    // Pattern: "interested in X"
    const interested = text.match(/interested\s+in\s+([^,\.]+)/i);
    if (interested) {
      facts.push({
        subject: primaryPerson,
        predicate: "interested_in",
        object: interested[1].trim(),
        confidence: 0.8,
      });
    }

    // Pattern: "X moved to Y" / "X joined Y" / "X now at Y"
    const moved = text.match(
      /(\w+(?:\s+\w+)?)\s+(?:moved\s+to|joined|now\s+at|switched\s+to)\s+([^,\.]+)/i
    );
    if (moved) {
      const person = resolveSubject(moved[1], primaryPerson);
      if (person) {
        facts.push({
          subject: person,
          predicate: "company",
          object: moved[2].trim(),
          confidence: 0.95,
        });
      }
    }

    // Pattern: "X knows about Y" / "expert in Y" / "experienced with Y"
    const expertise = text.match(
      /(\w+(?:\s+\w+)?)\s+(?:knows?\s+(?:about|a\s+lot\s+about)|expert\s+in|specializes?\s+in|experienced\s+with)\s+([^,\.]+)/i
    );
    if (expertise) {
      const person = resolveSubject(expertise[1], primaryPerson);
      if (person) {
        facts.push({
          subject: person,
          predicate: "expertise",
          object: expertise[2].trim(),
          confidence: 0.85,
        });
      }
    }

    // Pattern: "X's email/phone is Y"
    const contact = text.match(
      /(\w+(?:\s+\w+)?)(?:'s)?\s+(?:email|phone|twitter|linkedin)\s+(?:is\s+)?([^\s,\.]+)/i
    );
    if (contact) {
      const contactType = text.match(
        /(?:email|phone|twitter|linkedin)/i
      )[0].toLowerCase();
      const person = resolveSubject(contact[1], primaryPerson);
      if (person) {
        facts.push({
          subject: person,
          predicate: contactType,
          object: contact[2].trim(),
          confidence: 1.0,
        });
      }
    }

    // Technology mentions — attribute to primary person
    const techKeywords = [
      "Kafka", "Kubernetes", "k8s", "Docker", "React", "Rust",
      "ML", "observability", "infrastructure", "microservices",
      "GraphQL", "gRPC", "Terraform", "WebAssembly", "Flink",
      "Spark", "Elasticsearch", "serverless",
    ];
    for (const tech of techKeywords) {
      if (text.toLowerCase().includes(tech.toLowerCase())) {
        facts.push({
          subject: primaryPerson,
          predicate: "mentioned_topic",
          object: tech,
          confidence: 0.7,
        });
      }
    }
  }

  // Deduplicate by subject+predicate+object
  const seen = new Set();
  return facts.filter((f) => {
    const key = `${f.subject}|${f.predicate}|${f.object}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Procedural pattern extraction ──────────────────────────────────────

function extractProcedures(episodes) {
  const procedures = [];
  const texts = episodes.map((e) => e.raw_input.toLowerCase());

  // Detect "prep for call" pattern
  const hasCallPrep = texts.some(
    (t) => t.includes("prep") || t.includes("prepare") || t.includes("call")
  );
  if (hasCallPrep) {
    procedures.push({
      trigger: "call_prep",
      action:
        "When preparing for a call with someone: 1) Pull all facts about them, 2) Find recent interactions, 3) List their interests and expertise, 4) Note any open threads or follow-ups",
      examples: texts.filter(
        (t) =>
          t.includes("prep") || t.includes("prepare") || t.includes("call")
      ),
    });
  }

  // Detect "introduction" pattern
  const hasIntro = texts.some(
    (t) => t.includes("introduce") || t.includes("connect")
  );
  if (hasIntro) {
    procedures.push({
      trigger: "introduction",
      action:
        "When asked to connect two people: 1) Pull facts about both, 2) Find common interests or topics, 3) Draft an introduction noting the shared context",
      examples: texts.filter(
        (t) => t.includes("introduce") || t.includes("connect")
      ),
    });
  }

  return procedures;
}
