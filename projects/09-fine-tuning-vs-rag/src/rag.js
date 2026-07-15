/**
 * Approach 2: RAG (Retrieval-Augmented Generation)
 * Retrieve similar past tickets from training data, use them as context
 * to classify new tickets. Uses TF-IDF-style cosine similarity (no external vector DB).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CATEGORIES = ["billing", "technical", "account", "feature-request"];

/**
 * Simple TF-IDF vector store — no external dependencies.
 * In production you'd use ChromaDB, Pinecone, etc.
 */
class SimpleVectorStore {
  constructor() {
    this.documents = [];
    this.vectors = [];
    this.vocabulary = new Map();
    this.idf = new Map();
  }

  /**
   * Tokenize and normalize text.
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  /**
   * Build the index from training tickets.
   */
  index(tickets) {
    this.documents = tickets;

    // Build vocabulary
    const docFreq = new Map();
    const allTokenSets = [];

    for (const ticket of tickets) {
      const tokens = this.tokenize(ticket.text);
      const uniqueTokens = new Set(tokens);
      allTokenSets.push(tokens);

      for (const token of uniqueTokens) {
        this.vocabulary.set(token, (this.vocabulary.get(token) || 0) + 1);
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    // Compute IDF
    const N = tickets.length;
    for (const [token, df] of docFreq) {
      this.idf.set(token, Math.log(N / (1 + df)));
    }

    // Compute TF-IDF vectors
    this.vectors = allTokenSets.map((tokens) => this.computeTfIdf(tokens));
  }

  /**
   * Compute TF-IDF vector for a token list.
   */
  computeTfIdf(tokens) {
    const tf = new Map();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }

    const vector = new Map();
    for (const [token, count] of tf) {
      const idf = this.idf.get(token) || 0;
      vector.set(token, (count / tokens.length) * idf);
    }
    return vector;
  }

  /**
   * Cosine similarity between two sparse vectors.
   */
  cosineSimilarity(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const [key, val] of a) {
      normA += val * val;
      if (b.has(key)) dot += val * b.get(key);
    }
    for (const [, val] of b) {
      normB += val * val;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Retrieve top-k most similar tickets to the query.
   */
  retrieve(queryText, k = 5) {
    const queryTokens = this.tokenize(queryText);
    const queryVector = this.computeTfIdf(queryTokens);

    const scored = this.vectors.map((docVector, i) => ({
      document: this.documents[i],
      score: this.cosineSimilarity(queryVector, docVector),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}

/**
 * Classify a ticket using RAG: retrieve similar tickets, then ask the LLM
 * to classify based on the retrieved examples.
 */
export async function classifyWithRAG(model, vectorStore, ticketText, k = 5) {
  // Step 1: Retrieve similar tickets
  const retrievalStart = Date.now();
  const retrieved = vectorStore.retrieve(ticketText, k);
  const retrievalLatency = Date.now() - retrievalStart;

  // Step 2: Build prompt with retrieved context
  const contextStr = retrieved
    .map(
      (r, i) =>
        `${i + 1}. Ticket: "${r.document.text}"\n   Category: ${r.document.category} (similarity: ${r.score.toFixed(3)})`
    )
    .join("\n");

  const prompt = `You are classifying customer support tickets. Here are similar past tickets and their categories:

${contextStr}

Based on these examples, classify the following ticket into exactly one category.
Categories: ${CATEGORIES.join(", ")}

Ticket: "${ticketText}"

Respond with ONLY the category name, nothing else.`;

  // Step 3: Generate classification
  const genStart = Date.now();
  const result = await model.generateContent(prompt);
  const genLatency = Date.now() - genStart;
  const response = result.response.text().trim().toLowerCase();

  const predicted = CATEGORIES.find((c) => response.includes(c)) || response;

  return {
    predicted,
    latency: retrievalLatency + genLatency,
    retrievalLatency,
    generationLatency: genLatency,
    retrievedCount: retrieved.length,
    topSimilarity: retrieved[0]?.score || 0,
    inputTokens: prompt.length / 4,
    approach: "rag",
  };
}

/**
 * Build and return a vector store from training data.
 */
export function buildVectorStore(tickets) {
  const store = new SimpleVectorStore();
  const indexStart = Date.now();
  store.index(tickets);
  const indexTime = Date.now() - indexStart;
  return { store, indexTime, documentCount: tickets.length };
}

// Standalone run
if (process.argv[1] && process.argv[1].endsWith("rag.js")) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Set GEMINI_API_KEY environment variable");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const ticketsPath = join(__dirname, "..", "data", "tickets.json");
  const tickets = JSON.parse(readFileSync(ticketsPath, "utf-8"));

  console.log("Building vector store...");
  const { store, indexTime, documentCount } = buildVectorStore(tickets);
  console.log(
    `Indexed ${documentCount} tickets in ${indexTime}ms\n`
  );

  const testTicket = "I was charged twice for my subscription and need a refund.";
  console.log(`Test ticket: "${testTicket}"\n`);

  const result = await classifyWithRAG(model, store, testTicket);
  console.log("RAG result:", result);
}
