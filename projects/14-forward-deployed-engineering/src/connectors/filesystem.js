/**
 * Filesystem Connector
 *
 * Reads documents from a local directory.
 * Supports: .txt, .md, .json (extensible to .pdf, .docx via processors)
 */

import fs from 'fs/promises';
import path from 'path';
import { BaseConnector } from './base.js';

export class FilesystemConnector extends BaseConnector {
  constructor(config = {}) {
    super(config);
    this.name = 'filesystem';
    this.basePath = config.basePath || './data/sample-docs';
    this.extensions = config.extensions || ['.txt', '.md', '.json', '.pdf', '.docx'];
    this._fileList = null;
  }

  async connect() {
    try {
      const stat = await fs.stat(this.basePath);
      if (!stat.isDirectory()) {
        return { ok: false, message: `${this.basePath} is not a directory` };
      }
      this._connected = true;
      return { ok: true, message: `Connected to ${this.basePath}` };
    } catch (err) {
      return { ok: false, message: `Cannot access ${this.basePath}: ${err.message}` };
    }
  }

  async listDocuments() {
    if (!this._connected) await this.connect();

    const entries = await fs.readdir(this.basePath, { withFileTypes: true });
    const docs = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!this.extensions.includes(ext)) continue;

      const filePath = path.join(this.basePath, entry.name);
      const stat = await fs.stat(filePath);

      docs.push({
        id: entry.name,
        name: entry.name,
        type: ext.slice(1), // remove the dot
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }

    this._fileList = docs;
    return docs;
  }

  async fetchDocument(id) {
    if (!this._connected) await this.connect();

    const filePath = path.join(this.basePath, id);

    try {
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');

      return {
        content,
        metadata: {
          id,
          name: id,
          type: path.extname(id).slice(1),
          size: stat.size,
          modified: stat.mtime.toISOString(),
          source: `filesystem:${this.basePath}`,
        },
      };
    } catch (err) {
      throw new Error(`Failed to fetch document ${id}: ${err.message}`);
    }
  }
}
