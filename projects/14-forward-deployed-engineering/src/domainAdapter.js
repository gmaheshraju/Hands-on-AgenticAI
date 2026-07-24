/**
 * Domain Adaptation Pipeline
 *
 * Takes customer documents and adapts the AI system:
 *  1. Extract domain-specific vocabulary
 *  2. Generate few-shot Q&A examples
 *  3. Build customized system prompt
 *  4. Score adaptation quality
 *
 * This is the highest-value FDE pattern: a generic AI fails on legal jargon,
 * medical abbreviations, or internal acronyms. Domain adaptation is the difference
 * between a failed pilot and a signed contract.
 */

// --- Legal domain reference vocabulary ---
// In production, this would be loaded from a domain pack or built from corpora.
const LEGAL_TERM_PATTERNS = [
  // Contract & agreement terms
  { pattern: /\b(indemnif(?:y|ication|ied))\b/gi, category: 'liability', definition: 'To compensate for loss or damage; a contractual obligation to cover another party\'s losses' },
  { pattern: /\b(force\s+majeure)\b/gi, category: 'contracts', definition: 'Unforeseeable circumstances that prevent fulfillment of a contract (acts of God, war, etc.)' },
  { pattern: /\b(fiduciary)\b/gi, category: 'duties', definition: 'A legal obligation to act in the best interest of another party' },
  { pattern: /\b(escrow)\b/gi, category: 'transactions', definition: 'A financial arrangement where a third party holds funds until conditions are met' },
  { pattern: /\b(severance)\b/gi, category: 'employment', definition: 'Compensation paid to an employee upon termination of employment' },
  { pattern: /\b(arbitration)\b/gi, category: 'disputes', definition: 'A method of dispute resolution outside the courts, where a neutral arbitrator makes a binding decision' },
  { pattern: /\b(injunctive\s+relief)\b/gi, category: 'remedies', definition: 'A court order requiring a party to do or refrain from doing a specific act' },
  { pattern: /\b(due\s+diligence)\b/gi, category: 'transactions', definition: 'Investigation or audit of a potential investment or product to confirm facts before a transaction' },
  { pattern: /\b(material\s+adverse\s+effect)\b/gi, category: 'M&A', definition: 'A significant negative impact on a company\'s business, operations, or financial condition' },
  { pattern: /\b(representations?\s+and\s+warranties)\b/gi, category: 'contracts', definition: 'Statements of fact (representations) and promises (warranties) in a contract' },
  { pattern: /\b(non-?compete)\b/gi, category: 'employment', definition: 'A clause restricting an employee from working for competitors after leaving' },
  { pattern: /\b(non-?solicitation)\b/gi, category: 'employment', definition: 'A clause restricting solicitation of clients or employees after departure' },
  { pattern: /\b(COBRA)\b/g, category: 'benefits', definition: 'Consolidated Omnibus Budget Reconciliation Act — continuation of health coverage after employment ends' },
  { pattern: /\b(GAAP)\b/g, category: 'finance', definition: 'Generally Accepted Accounting Principles — standard framework of accounting guidelines' },
  { pattern: /\b(Hart-Scott-Rodino)\b/gi, category: 'regulatory', definition: 'HSR Act — requires companies to file pre-merger notification with the FTC and DOJ' },
  { pattern: /\b(VWAP)\b/g, category: 'finance', definition: 'Volume Weighted Average Price — average price weighted by trading volume' },
  { pattern: /\b(triple\s+net|NNN)\b/gi, category: 'real estate', definition: 'Lease where tenant pays base rent plus property taxes, insurance, and maintenance' },
  { pattern: /\b(in\s+terrorem)\b/gi, category: 'estate', definition: 'A no-contest clause designed to deter challenges to a will or trust' },
  { pattern: /\b(droit\s+moral|moral\s+rights)\b/gi, category: 'IP', definition: 'Rights of creators to be credited and to prevent distortion of their work' },
  { pattern: /\b(ejusdem\s+generis)\b/gi, category: 'interpretation', definition: 'Rule of interpretation: general words following specific words are limited to the same class' },
  { pattern: /\b(DSAR|data\s+subject\s+access\s+request)\b/gi, category: 'privacy', definition: 'A request by an individual to access the personal data held about them' },
  { pattern: /\b(SOC\s+2)\b/gi, category: 'compliance', definition: 'Service Organization Control 2 — audit framework for data security and privacy controls' },
  { pattern: /\b(CCPA)\b/g, category: 'privacy', definition: 'California Consumer Privacy Act — state privacy law giving consumers control over their data' },
  { pattern: /\b(GDPR)\b/g, category: 'privacy', definition: 'General Data Protection Regulation — EU data privacy and protection law' },
  { pattern: /\b(409A\s+valuation)\b/gi, category: 'tax', definition: 'IRS Section 409A — requires independent valuation of company stock for option pricing' },
  { pattern: /\b(earnout)\b/gi, category: 'M&A', definition: 'Additional purchase price payments contingent on future performance milestones' },
  { pattern: /\b(no-?shop)\b/gi, category: 'M&A', definition: 'A clause preventing a seller from soliciting competing acquisition offers' },
  { pattern: /\b(stipulation\s+of\s+dismissal)\b/gi, category: 'litigation', definition: 'An agreement between parties to dismiss a lawsuit, filed with the court' },
  { pattern: /\b(Section\s+1542)\b/gi, category: 'releases', definition: 'California Civil Code section — waiver of unknown claims in a general release' },
];

export class DomainAdapter {
  constructor() {
    this.vocabulary = [];
    this.fewShotExamples = [];
    this.systemPrompt = '';
    this.stats = {
      documentsAnalyzed: 0,
      uniqueTermsFound: 0,
      categoriesFound: new Set(),
      fewShotCount: 0,
    };
  }

  /**
   * Run the full domain adaptation pipeline.
   * @param {Array<{text: string, metadata: object}>} processedDocs — output from DocumentProcessor
   * @returns {{vocabulary: Array, fewShotExamples: Array, systemPrompt: string, stats: object}}
   */
  async adapt(processedDocs) {
    // Step 1: Extract domain vocabulary
    this.vocabulary = this._extractVocabulary(processedDocs);

    // Step 2: Generate few-shot examples
    this.fewShotExamples = this._generateFewShotExamples(processedDocs);

    // Step 3: Build system prompt
    this.systemPrompt = this._buildSystemPrompt();

    // Compute stats
    this.stats.documentsAnalyzed = processedDocs.length;
    this.stats.uniqueTermsFound = this.vocabulary.length;
    this.stats.categoriesFound = [...new Set(this.vocabulary.map((t) => t.category))];
    this.stats.fewShotCount = this.fewShotExamples.length;

    return {
      vocabulary: this.vocabulary,
      fewShotExamples: this.fewShotExamples,
      systemPrompt: this.systemPrompt,
      stats: this.stats,
    };
  }

  /**
   * Step 1: Extract domain-specific vocabulary from documents.
   * Identifies terms, counts occurrences, categorizes them.
   */
  _extractVocabulary(processedDocs) {
    const termMap = new Map(); // term -> {count, category, definition, sources}

    const allText = processedDocs
      .filter((d) => d.quality?.status !== 'FAILED')
      .map((d) => d.text)
      .join('\n');

    for (const termDef of LEGAL_TERM_PATTERNS) {
      const matches = allText.match(termDef.pattern);
      if (matches && matches.length > 0) {
        const normalized = matches[0].toLowerCase().trim();
        const existing = termMap.get(normalized);
        if (existing) {
          existing.count += matches.length;
        } else {
          termMap.set(normalized, {
            term: matches[0],
            count: matches.length,
            category: termDef.category,
            definition: termDef.definition,
          });
        }
      }
    }

    // Also extract capitalized multi-word phrases that might be domain-specific
    // (proper nouns, act names, regulation references)
    const customTerms = allText.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}\b/g) || [];
    const customCounts = new Map();
    for (const term of customTerms) {
      // Skip common English phrases
      if (/^(The |This |That |These |Those |Each |Every |Any |All |Some |In |On |At |By |For |With )/i.test(term)) continue;
      customCounts.set(term, (customCounts.get(term) || 0) + 1);
    }
    // Include terms that appear 3+ times (likely domain-specific)
    for (const [term, count] of customCounts) {
      if (count >= 3 && !termMap.has(term.toLowerCase())) {
        termMap.set(term.toLowerCase(), {
          term,
          count,
          category: 'custom',
          definition: '(customer-specific term — definition needed)',
        });
      }
    }

    return [...termMap.values()].sort((a, b) => b.count - a.count);
  }

  /**
   * Step 2: Generate few-shot Q&A examples from documents.
   * Creates question-answer pairs that demonstrate the kind of queries users will ask.
   *
   * In production, this would call an LLM API. Here we use template-based generation
   * to demonstrate the pattern without requiring an API key.
   */
  _generateFewShotExamples(processedDocs) {
    const examples = [];

    for (const doc of processedDocs) {
      if (doc.quality?.status === 'FAILED') continue;

      const docName = doc.metadata?.name || 'Unknown Document';
      const text = doc.text;

      // Pattern 1: "What does [document] say about [topic]?"
      const sections = text.match(/^\d+\.\s+(.+?)$/gm) || [];
      for (const section of sections.slice(0, 2)) {
        const topic = section.replace(/^\d+\.\s+/, '').trim();
        const sectionText = this._extractSection(text, topic);
        if (sectionText && sectionText.length > 50) {
          examples.push({
            question: `What does the ${this._docTypeLabel(docName)} say about ${topic.toLowerCase()}?`,
            answer: this._summarizeSection(sectionText),
            source: docName,
            type: 'comprehension',
          });
        }
      }

      // Pattern 2: "What are the key terms in [document]?"
      if (sections.length >= 3) {
        examples.push({
          question: `What are the key provisions in the ${this._docTypeLabel(docName)}?`,
          answer: `The key provisions include: ${sections.slice(0, 5).map(s => s.replace(/^\d+\.\s+/, '')).join(', ')}.`,
          source: docName,
          type: 'summary',
        });
      }

      // Pattern 3: Specific detail extraction
      const amounts = text.match(/\$[\d,]+(?:\.\d{2})?(?:\s+(?:million|billion))?/g);
      if (amounts && amounts.length > 0) {
        examples.push({
          question: `What are the financial figures mentioned in the ${this._docTypeLabel(docName)}?`,
          answer: `The document references the following amounts: ${amounts.join(', ')}.`,
          source: docName,
          type: 'extraction',
        });
      }

      // Pattern 4: Date/deadline extraction
      const dates = text.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g);
      if (dates && dates.length > 0) {
        examples.push({
          question: `What are the important dates in the ${this._docTypeLabel(docName)}?`,
          answer: `Key dates include: ${dates.join(', ')}.`,
          source: docName,
          type: 'extraction',
        });
      }

      // Pattern 5: Obligation/requirement questions
      const obligations = text.match(/shall\s+(?:not\s+)?[a-z]+/gi);
      if (obligations && obligations.length >= 2) {
        examples.push({
          question: `What obligations does the ${this._docTypeLabel(docName)} impose?`,
          answer: `The document contains ${obligations.length} obligation clauses, including requirements to ${obligations.slice(0, 3).map(o => o.replace(/^shall\s+/i, '')).join(', ')}.`,
          source: docName,
          type: 'analysis',
        });
      }
    }

    // Deduplicate and limit to 20 examples
    const seen = new Set();
    return examples
      .filter((ex) => {
        const key = ex.question;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  }

  /**
   * Step 3: Build a domain-specific system prompt.
   * Combines vocabulary, few-shot examples, and customer-specific instructions.
   */
  _buildSystemPrompt() {
    const vocabSection = this.vocabulary.length > 0
      ? `\n## Domain Vocabulary\nThe following terms are frequently used in this customer's documents. Use these definitions when interpreting and answering questions:\n\n${this.vocabulary
          .slice(0, 25)
          .map((t) => `- **${t.term}** (${t.category}): ${t.definition}`)
          .join('\n')}\n`
      : '';

    const categorySummary = [...new Set(this.vocabulary.map((t) => t.category))];

    const fewShotSection = this.fewShotExamples.length > 0
      ? `\n## Example Interactions\nHere are examples of the types of questions users will ask and the expected response style:\n\n${this.fewShotExamples
          .slice(0, 5)
          .map(
            (ex, i) =>
              `### Example ${i + 1} (${ex.type})\n**User:** ${ex.question}\n**Assistant:** ${ex.answer}`
          )
          .join('\n\n')}\n`
      : '';

    return `# Legal Document Analysis Assistant

You are an AI assistant specialized in analyzing legal documents for a law firm. Your role is to help attorneys, paralegals, and staff quickly understand, compare, and extract information from legal documents.

## Core Capabilities
- Contract clause extraction and comparison
- Regulatory compliance checking
- Risk identification and flagging
- Document summarization with legal precision
- Term and obligation tracking across documents

## Domain Context
This customer operates in the following legal areas: ${categorySummary.join(', ')}.
${vocabSection}
## Response Guidelines
1. **Precision over brevity**: Legal analysis requires exact language. Quote relevant clauses when answering.
2. **Flag risks**: Proactively identify clauses that may pose legal risks (broad indemnification, unilateral termination, unlimited liability).
3. **Cross-reference**: When answering about one document, note relevant provisions in other ingested documents.
4. **Cite sources**: Always reference the specific document and section number.
5. **Disclaimers**: This tool provides document analysis, not legal advice. Include appropriate disclaimers.
${fewShotSection}
## Important Notes
- Never fabricate clause language — only quote text that exists in the ingested documents.
- When uncertain, say so explicitly rather than guessing.
- Maintain attorney-client privilege awareness — do not suggest sharing privileged information.
- Use standard legal citation formats when referencing cases or statutes.`;
  }

  // --- Helpers ---

  _docTypeLabel(name) {
    const lower = name.toLowerCase();
    if (lower.includes('nda')) return 'NDA';
    if (lower.includes('employment')) return 'employment agreement';
    if (lower.includes('lease')) return 'lease agreement';
    if (lower.includes('merger')) return 'merger agreement';
    if (lower.includes('ip') || lower.includes('intellectual')) return 'IP assignment agreement';
    if (lower.includes('privacy')) return 'privacy policy';
    if (lower.includes('terms')) return 'terms of service';
    if (lower.includes('power')) return 'power of attorney';
    if (lower.includes('settlement')) return 'settlement agreement';
    if (lower.includes('compliance') || lower.includes('memo')) return 'compliance memorandum';
    return 'document';
  }

  _extractSection(text, topic) {
    // Find section content by looking for the topic heading and extracting until next section
    const escapedTopic = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escapedTopic}[\\s\\S]*?(?=\\n\\d+\\.\\s|$)`, 'i');
    const match = text.match(regex);
    return match ? match[0].slice(0, 500) : null;
  }

  _summarizeSection(text) {
    // Simple extractive summary: first two sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 2).join(' ').trim() || text.slice(0, 200);
  }
}
