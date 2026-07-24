export class Scratchpad {
  constructor(opts = {}) {
    this.maxEntries = opts.maxEntries ?? 50;
    this.store = new Map();
    this.writeCount = 0;
    this.readCount = 0;
  }

  write(key, content, metadata = {}) {
    if (!key || !content) throw new Error('key and content are required');

    const tokens = Math.ceil(content.length / 4);

    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }

    this.store.set(key, {
      content,
      tokens,
      metadata,
      createdAt: Date.now(),
      accessedAt: Date.now(),
    });
    this.writeCount++;
    return tokens;
  }

  read(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    entry.accessedAt = Date.now();
    this.readCount++;
    return entry.content;
  }

  search(query) {
    const terms = query.toLowerCase().split(/\s+/);
    const results = [];
    for (const [key, entry] of this.store) {
      const text = `${key} ${entry.content}`.toLowerCase();
      const score = terms.filter(t => text.includes(t)).length / terms.length;
      if (score > 0) results.push({ key, score, preview: entry.content.slice(0, 100) });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  summarize() {
    if (this.store.size === 0) return [];
    const index = [];
    for (const [key, entry] of this.store) {
      index.push({
        key,
        preview: entry.content.slice(0, 60).replace(/\n/g, ' '),
        tokens: entry.tokens,
      });
    }
    return index;
  }

  formatIndex() {
    const items = this.summarize();
    if (!items.length) return '[Scratchpad is empty]';
    return 'Scratchpad contents:\n' + items.map(i => `  - ${i.key} (${i.tokens}tok): ${i.preview}...`).join('\n');
  }

  clear() {
    this.store.clear();
  }

  stats() {
    let totalTokens = 0;
    for (const entry of this.store.values()) totalTokens += entry.tokens;
    return { entries: this.store.size, totalTokens, writes: this.writeCount, reads: this.readCount };
  }
}
