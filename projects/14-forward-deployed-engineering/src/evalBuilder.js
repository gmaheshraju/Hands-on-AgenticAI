/**
 * Eval Set Builder
 *
 * Auto-generates candidate Q&A pairs from customer documents,
 * provides a CLI review interface for human-in-the-loop curation,
 * and exports the golden eval set as JSON.
 *
 * Target: build a 30-question eval set in under 1 hour of FDE time.
 */

import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

export class EvalBuilder {
  constructor() {
    this.candidates = [];
    this.reviewed = [];
    this.rejected = [];
  }

  /**
   * Auto-generate candidate Q&A pairs from processed documents.
   *
   * In production, this would call an LLM to generate questions.
   * Here we use template-based generation to demonstrate the pattern.
   * Each document generates 3-5 questions across different question types.
   *
   * @param {Array<{text: string, metadata: object}>} processedDocs
   * @returns {Array<{id: string, question: string, expectedAnswer: string, source: string, type: string, difficulty: string}>}
   */
  generateCandidates(processedDocs) {
    this.candidates = [];
    let idCounter = 1;

    for (const doc of processedDocs) {
      if (doc.quality?.status === 'FAILED') continue;
      const text = doc.text;
      const docName = doc.metadata?.name || 'Unknown';

      // Type 1: Factual recall — "What is the [specific value]?"
      const dollarAmounts = [...text.matchAll(/(\$[\d,]+(?:\.\d{2})?(?:\s+(?:million|billion))?)/g)];
      for (const match of dollarAmounts.slice(0, 2)) {
        const context = this._getContext(text, match.index, 200);
        this.candidates.push({
          id: `eval-${String(idCounter++).padStart(3, '0')}`,
          question: `What is the dollar amount mentioned in the context of "${this._getContextLabel(context)}" in ${docName}?`,
          expectedAnswer: `The amount is ${match[1]}.`,
          source: docName,
          type: 'factual',
          difficulty: 'easy',
        });
      }

      // Type 2: Comprehension — "Explain the [clause/section]"
      const sectionHeaders = [...text.matchAll(/^\d+\.\s+(.+?)$/gm)];
      for (const header of sectionHeaders.slice(0, 2)) {
        const sectionName = header[1].trim();
        const sectionContent = this._extractSectionContent(text, header.index);
        if (sectionContent.length > 100) {
          this.candidates.push({
            id: `eval-${String(idCounter++).padStart(3, '0')}`,
            question: `Explain the "${sectionName}" section of ${docName}.`,
            expectedAnswer: this._createSummary(sectionContent),
            source: docName,
            type: 'comprehension',
            difficulty: 'medium',
          });
        }
      }

      // Type 3: Analytical — "What risks does [document] present?"
      const riskTerms = text.match(/\b(liability|risk|breach|default|penalty|violation|termination|damages)\b/gi);
      if (riskTerms && riskTerms.length >= 2) {
        const uniqueRisks = [...new Set(riskTerms.map((t) => t.toLowerCase()))];
        this.candidates.push({
          id: `eval-${String(idCounter++).padStart(3, '0')}`,
          question: `What are the main risks or liabilities outlined in ${docName}?`,
          expectedAnswer: `The document addresses the following risk areas: ${uniqueRisks.join(', ')}. ${this._getRiskContext(text)}`,
          source: docName,
          type: 'analytical',
          difficulty: 'hard',
        });
      }

      // Type 4: Comparison — "How does [term] differ from standard?"
      const timeframes = [...text.matchAll(/(\d+)\s*(?:\(\d+\))?\s*(days?|months?|years?|weeks?)/gi)];
      if (timeframes.length >= 2) {
        this.candidates.push({
          id: `eval-${String(idCounter++).padStart(3, '0')}`,
          question: `What are the key timeframes and deadlines specified in ${docName}?`,
          expectedAnswer: `Key timeframes include: ${timeframes.slice(0, 5).map((m) => `${m[1]} ${m[2]}`).join(', ')}.`,
          source: docName,
          type: 'extraction',
          difficulty: 'easy',
        });
      }

      // Type 5: Application — "If [scenario], what does the document say?"
      const obligations = [...text.matchAll(/shall\s+(not\s+)?([a-z]+(?:\s+[a-z]+){0,3})/gi)];
      if (obligations.length >= 2) {
        this.candidates.push({
          id: `eval-${String(idCounter++).padStart(3, '0')}`,
          question: `What are the mandatory obligations (indicated by "shall") in ${docName}?`,
          expectedAnswer: `The document specifies ${obligations.length} obligations, including: ${obligations.slice(0, 4).map((m) => `"shall ${m[0].replace(/^shall\s+/i, '')}"`).join(', ')}.`,
          source: docName,
          type: 'application',
          difficulty: 'medium',
        });
      }
    }

    return this.candidates;
  }

  /**
   * Interactive CLI review of candidates.
   * FDE can accept (a), edit (e), reject (r), or skip (s) each question.
   */
  async reviewInteractive() {
    if (this.candidates.length === 0) {
      console.log('No candidates to review. Run generateCandidates() first.');
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    console.log('\n=== EVAL SET REVIEW ===');
    console.log(`${this.candidates.length} candidate questions to review.`);
    console.log('Commands: (a)ccept  (e)dit  (r)eject  (s)kip  (q)uit\n');

    for (let i = 0; i < this.candidates.length; i++) {
      const c = this.candidates[i];
      console.log(`--- [${i + 1}/${this.candidates.length}] ${c.id} (${c.type}, ${c.difficulty}) ---`);
      console.log(`Source: ${c.source}`);
      console.log(`Q: ${c.question}`);
      console.log(`A: ${c.expectedAnswer}`);
      console.log();

      const action = await ask('Action [a/e/r/s/q]: ');

      switch (action.trim().toLowerCase()) {
        case 'a':
          this.reviewed.push({ ...c, status: 'accepted' });
          console.log('  -> Accepted\n');
          break;
        case 'e': {
          const newQ = await ask('  New question (Enter to keep): ');
          const newA = await ask('  New answer (Enter to keep): ');
          this.reviewed.push({
            ...c,
            question: newQ.trim() || c.question,
            expectedAnswer: newA.trim() || c.expectedAnswer,
            status: 'edited',
          });
          console.log('  -> Saved with edits\n');
          break;
        }
        case 'r':
          this.rejected.push({ ...c, status: 'rejected' });
          console.log('  -> Rejected\n');
          break;
        case 'q':
          console.log('\nReview session ended early.\n');
          rl.close();
          return this._reviewSummary();
        case 's':
        default:
          console.log('  -> Skipped\n');
          break;
      }
    }

    rl.close();
    return this._reviewSummary();
  }

  /**
   * Auto-accept all candidates (for demo/testing).
   */
  acceptAll() {
    this.reviewed = this.candidates.map((c) => ({ ...c, status: 'auto-accepted' }));
    return this._reviewSummary();
  }

  /**
   * Export the reviewed eval set as JSON.
   * @param {string} outputPath
   */
  async export(outputPath) {
    const evalSet = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      customer: 'Legal Tech Solutions (Demo)',
      stats: {
        totalCandidates: this.candidates.length,
        accepted: this.reviewed.length,
        rejected: this.rejected.length,
      },
      questions: this.reviewed.map((q) => ({
        id: q.id,
        question: q.question,
        expectedAnswer: q.expectedAnswer,
        source: q.source,
        type: q.type,
        difficulty: q.difficulty,
        status: q.status,
      })),
    };

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(evalSet, null, 2));
    console.log(`Eval set exported to ${outputPath} (${evalSet.questions.length} questions)`);
    return evalSet;
  }

  _reviewSummary() {
    return {
      accepted: this.reviewed.length,
      rejected: this.rejected.length,
      remaining: this.candidates.length - this.reviewed.length - this.rejected.length,
    };
  }

  _getContext(text, index, radius) {
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + radius);
    return text.slice(start, end);
  }

  _getContextLabel(context) {
    // Extract a short label from context
    const match = context.match(/\b[A-Z][A-Z\s]+\b/) || context.match(/\b[A-Z][a-z]+(?:\s+[A-Za-z]+){0,2}/);
    return match ? match[0].trim().slice(0, 40) : 'this section';
  }

  _extractSectionContent(text, startIndex) {
    const rest = text.slice(startIndex);
    const nextSection = rest.match(/\n\d+\.\s+/);
    const end = nextSection ? nextSection.index : Math.min(rest.length, 500);
    return rest.slice(0, end).trim();
  }

  _createSummary(text) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 3).join(' ').trim() || text.slice(0, 300);
  }

  _getRiskContext(text) {
    const riskSentences = text.match(/[^.]*(?:liability|risk|breach|default|penalty|damages)[^.]*\./gi) || [];
    return riskSentences.slice(0, 2).join(' ').trim();
  }
}

// --- CLI entry point ---
if (process.argv[1] && process.argv[1].endsWith('evalBuilder.js')) {
  import('./connectors/filesystem.js').then(async ({ FilesystemConnector }) => {
    const { DocumentProcessor } = await import('./processor.js');

    const connector = new FilesystemConnector({
      basePath: path.resolve(process.argv[2] || './data/sample-docs'),
    });
    const processor = new DocumentProcessor();
    const results = await processor.processAll(connector);

    const builder = new EvalBuilder();
    builder.generateCandidates(results);
    console.log(`Generated ${builder.candidates.length} candidate questions.\n`);

    if (process.argv.includes('--auto')) {
      builder.acceptAll();
      await builder.export('./data/eval-set.json');
    } else {
      await builder.reviewInteractive();
      await builder.export('./data/eval-set.json');
    }
  });
}
