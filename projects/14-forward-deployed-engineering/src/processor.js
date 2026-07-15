/**
 * Document Processor
 *
 * Extracts text from documents of various formats.
 * Tracks extraction quality — flags failures, empty results, and garbage output.
 *
 * Supported formats:
 *   .txt  — direct read (no processing needed)
 *   .md   — strip markdown syntax, return plain text
 *   .json — extract text fields, pretty-print structure
 *   .pdf  — interface shown (would use pdf-parse in production)
 *   .docx — interface shown (would use mammoth in production)
 */

export class DocumentProcessor {
  constructor() {
    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      warnings: 0,
    };
    this.results = [];
  }

  /**
   * Process a single document: extract text and assess quality.
   * @param {{content: string, metadata: object}} doc
   * @returns {{text: string, quality: object, metadata: object}}
   */
  async process(doc) {
    const { content, metadata } = doc;
    const type = metadata.type || 'txt';
    this.stats.processed++;

    try {
      let extracted;
      switch (type) {
        case 'txt':
          extracted = this._extractText(content);
          break;
        case 'md':
          extracted = this._extractMarkdown(content);
          break;
        case 'json':
          extracted = this._extractJson(content);
          break;
        case 'pdf':
          extracted = this._extractPdf(content);
          break;
        case 'docx':
          extracted = this._extractDocx(content);
          break;
        default:
          throw new Error(`Unsupported format: .${type}`);
      }

      const quality = this._assessQuality(extracted, metadata);
      this.stats.succeeded++;
      if (quality.warnings.length > 0) this.stats.warnings++;

      const result = { text: extracted, quality, metadata };
      this.results.push(result);
      return result;
    } catch (err) {
      this.stats.failed++;
      const result = {
        text: '',
        quality: {
          score: 0,
          status: 'FAILED',
          warnings: [err.message],
          wordCount: 0,
          charCount: 0,
        },
        metadata,
      };
      this.results.push(result);
      return result;
    }
  }

  /**
   * Process multiple documents from a connector.
   * @param {BaseConnector} connector
   * @returns {Promise<Array>} processed results
   */
  async processAll(connector) {
    const docs = await connector.listDocuments();
    const results = [];

    for (const docMeta of docs) {
      const doc = await connector.fetchDocument(docMeta.id);
      const result = await this.process(doc);
      results.push(result);
    }

    return results;
  }

  /**
   * Get processing summary.
   */
  getSummary() {
    return {
      ...this.stats,
      successRate: this.stats.processed > 0
        ? ((this.stats.succeeded / this.stats.processed) * 100).toFixed(1) + '%'
        : '0%',
      avgQuality: this.results.length > 0
        ? (this.results.reduce((sum, r) => sum + r.quality.score, 0) / this.results.length).toFixed(2)
        : 0,
    };
  }

  // --- Format-specific extractors ---

  _extractText(content) {
    // Plain text: normalize whitespace, trim
    return content.replace(/\r\n/g, '\n').trim();
  }

  _extractMarkdown(content) {
    // Strip markdown formatting to get plain text
    return content
      .replace(/^#{1,6}\s+/gm, '')          // headers
      .replace(/\*\*(.+?)\*\*/g, '$1')       // bold
      .replace(/\*(.+?)\*/g, '$1')           // italic
      .replace(/`(.+?)`/g, '$1')             // inline code
      .replace(/```[\s\S]*?```/g, '')        // code blocks
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')   // links
      .replace(/^[-*+]\s+/gm, '')           // list markers
      .replace(/^\d+\.\s+/gm, '')           // numbered list markers
      .replace(/^>\s+/gm, '')               // blockquotes
      .replace(/---+/g, '')                  // horizontal rules
      .replace(/\n{3,}/g, '\n\n')           // collapse multiple blank lines
      .trim();
  }

  _extractJson(content) {
    // Parse JSON and extract all string values recursively
    const parsed = JSON.parse(content);
    const texts = [];
    this._walkJson(parsed, texts);
    return texts.join('\n');
  }

  _walkJson(obj, texts) {
    if (typeof obj === 'string' && obj.length > 10) {
      texts.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach((item) => this._walkJson(item, texts));
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach((val) => this._walkJson(val, texts));
    }
  }

  _extractPdf(content) {
    // Interface placeholder — in production, use pdf-parse:
    //   import pdfParse from 'pdf-parse';
    //   const data = await pdfParse(buffer);
    //   return data.text;
    //
    // For this demo, if content is already text (test scenario), return it.
    if (typeof content === 'string' && content.length > 0) {
      return content;
    }
    throw new Error('PDF extraction requires pdf-parse library (not installed for demo)');
  }

  _extractDocx(content) {
    // Interface placeholder — in production, use mammoth:
    //   import mammoth from 'mammoth';
    //   const result = await mammoth.extractRawText({buffer});
    //   return result.value;
    //
    // For this demo, if content is already text (test scenario), return it.
    if (typeof content === 'string' && content.length > 0) {
      return content;
    }
    throw new Error('DOCX extraction requires mammoth library (not installed for demo)');
  }

  // --- Quality assessment ---

  _assessQuality(text, metadata) {
    const warnings = [];
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const charCount = text.length;

    // Check for empty extraction
    if (charCount === 0) {
      return { score: 0, status: 'EMPTY', warnings: ['Extraction produced no text'], wordCount: 0, charCount: 0 };
    }

    // Check for suspiciously short documents
    if (wordCount < 10) {
      warnings.push(`Very short document: only ${wordCount} words`);
    }

    // Check for garbage output (high ratio of non-alphanumeric characters)
    const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / charCount;
    if (alphaRatio < 0.3) {
      warnings.push(`Possible garbage output: only ${(alphaRatio * 100).toFixed(0)}% alphabetic characters`);
    }

    // Check for encoding issues
    if (/�/.test(text)) {
      warnings.push('Contains replacement characters — possible encoding issue');
    }

    // Check extraction completeness (text should be at least 20% of raw file size)
    if (metadata.size && charCount < metadata.size * 0.2) {
      warnings.push(`Extraction may be incomplete: ${charCount} chars from ${metadata.size} byte file`);
    }

    // Score: 1.0 = perfect, lower for warnings
    let score = 1.0;
    score -= warnings.length * 0.15;
    score = Math.max(0, Math.min(1.0, score));

    return {
      score: parseFloat(score.toFixed(2)),
      status: warnings.length === 0 ? 'OK' : 'WARNING',
      warnings,
      wordCount,
      charCount,
    };
  }
}
