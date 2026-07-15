/**
 * Base Connector Interface
 *
 * All data connectors must implement this interface.
 * Provides a pluggable abstraction for ingesting documents from any source.
 */

export class BaseConnector {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
    this._connected = false;
  }

  /**
   * Connect to the data source (authenticate, verify access, etc.)
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  async connect() {
    throw new Error(`${this.constructor.name}.connect() not implemented`);
  }

  /**
   * List all available documents in the data source.
   * @returns {Promise<Array<{id: string, name: string, type: string, size: number, modified: string}>>}
   */
  async listDocuments() {
    throw new Error(`${this.constructor.name}.listDocuments() not implemented`);
  }

  /**
   * Fetch a single document by ID.
   * @param {string} id - Document identifier
   * @returns {Promise<{content: string, metadata: {id: string, name: string, type: string, size: number, modified: string, source: string}}>}
   */
  async fetchDocument(id) {
    throw new Error(`${this.constructor.name}.fetchDocument() not implemented`);
  }

  /**
   * Test the connection and return diagnostics.
   * @returns {Promise<{ok: boolean, documentCount: number, errors: string[]}>}
   */
  async healthCheck() {
    const errors = [];
    try {
      if (!this._connected) {
        const result = await this.connect();
        if (!result.ok) errors.push(result.message);
      }
      const docs = await this.listDocuments();
      return { ok: errors.length === 0, documentCount: docs.length, errors };
    } catch (err) {
      errors.push(err.message);
      return { ok: false, documentCount: 0, errors };
    }
  }
}
