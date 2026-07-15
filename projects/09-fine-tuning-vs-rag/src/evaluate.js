/**
 * Head-to-Head Evaluation
 * Run all three approaches on the same test set.
 * Compute accuracy, per-category metrics, cost, and latency.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { classifyZeroShot, classifyFewShot } from "./prompting.js";
import { buildVectorStore, classifyWithRAG } from "./rag.js";
import { classifyWithFineTuning } from "./fineTuning.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CATEGORIES = ["billing", "technical", "account", "feature-request"];

/**
 * Compute classification metrics.
 */
function computeMetrics(results) {
  const total = results.length;
  const correct = results.filter((r) => r.predicted === r.actual).length;
  const accuracy = correct / total;

  // Per-category precision, recall, F1
  const perCategory = {};
  for (const cat of CATEGORIES) {
    const tp = results.filter(
      (r) => r.predicted === cat && r.actual === cat
    ).length;
    const fp = results.filter(
      (r) => r.predicted === cat && r.actual !== cat
    ).length;
    const fn = results.filter(
      (r) => r.predicted !== cat && r.actual === cat
    ).length;

    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 =
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);

    perCategory[cat] = {
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      f1: Math.round(f1 * 1000) / 1000,
      support: results.filter((r) => r.actual === cat).length,
    };
  }

  // Latency stats
  const latencies = results.map((r) => r.latency);
  const avgLatency = Math.round(
    latencies.reduce((a, b) => a + b, 0) / latencies.length
  );
  const p50 = latencies.sort((a, b) => a - b)[Math.floor(total * 0.5)];
  const p95 = latencies.sort((a, b) => a - b)[Math.floor(total * 0.95)];

  // Cost estimate (Gemini Flash pricing)
  const totalInputTokens = results.reduce(
    (sum, r) => sum + (r.inputTokens || 0),
    0
  );
  const costPerQuery = (totalInputTokens / total / 1_000_000) * 0.075; // Gemini Flash input pricing

  return {
    accuracy: Math.round(accuracy * 1000) / 1000,
    correct,
    total,
    perCategory,
    latency: { avg: avgLatency, p50, p95 },
    costPerQuery: `$${costPerQuery.toFixed(6)}`,
    totalInputTokens: Math.round(totalInputTokens),
  };
}

/**
 * Run evaluation for a single approach across all test tickets.
 */
async function evaluateApproach(name, classifyFn, testSet, delayMs = 500) {
  const results = [];
  let completed = 0;

  for (const ticket of testSet) {
    try {
      const result = await classifyFn(ticket.text);
      results.push({
        id: ticket.id,
        text: ticket.text,
        actual: ticket.category,
        predicted: result.predicted,
        latency: result.latency,
        inputTokens: result.inputTokens,
      });
    } catch (err) {
      console.error(`  Error on ticket ${ticket.id}: ${err.message}`);
      results.push({
        id: ticket.id,
        text: ticket.text,
        actual: ticket.category,
        predicted: "error",
        latency: 0,
        inputTokens: 0,
      });
    }

    completed++;
    if (completed % 10 === 0) {
      process.stdout.write(`  ${name}: ${completed}/${testSet.length}\n`);
    }

    // Rate limit protection
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { name, results, metrics: computeMetrics(results) };
}

/**
 * Run full evaluation across all approaches.
 */
export async function runEvaluation(options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Load data
  const ticketsPath = join(__dirname, "..", "data", "tickets.json");
  const testSetPath = join(__dirname, "..", "data", "test-set.json");
  const trainingTickets = JSON.parse(readFileSync(ticketsPath, "utf-8"));
  const testSet = JSON.parse(readFileSync(testSetPath, "utf-8"));

  console.log(`Training tickets: ${trainingTickets.length}`);
  console.log(`Test set: ${testSet.length}`);
  console.log(`Categories: ${CATEGORIES.join(", ")}\n`);

  const delayMs = options.delayMs ?? 500;
  const allResults = {};

  // --- Approach 1a: Zero-shot ---
  console.log("=== Evaluating Zero-Shot Prompting ===");
  allResults.zeroShot = await evaluateApproach(
    "Zero-Shot",
    (text) => classifyZeroShot(model, text),
    testSet,
    delayMs
  );
  console.log(`  Accuracy: ${allResults.zeroShot.metrics.accuracy}\n`);

  // --- Approach 1b: Few-shot ---
  console.log("=== Evaluating Few-Shot Prompting ===");
  allResults.fewShot = await evaluateApproach(
    "Few-Shot",
    (text) => classifyFewShot(model, text),
    testSet,
    delayMs
  );
  console.log(`  Accuracy: ${allResults.fewShot.metrics.accuracy}\n`);

  // --- Approach 2: RAG ---
  console.log("=== Building RAG Vector Store ===");
  const { store, indexTime } = buildVectorStore(trainingTickets);
  console.log(`  Indexed in ${indexTime}ms`);

  console.log("=== Evaluating RAG ===");
  allResults.rag = await evaluateApproach(
    "RAG",
    (text) => classifyWithRAG(model, store, text),
    testSet,
    delayMs
  );
  console.log(`  Accuracy: ${allResults.rag.metrics.accuracy}\n`);

  // --- Approach 3: Fine-Tuned (mock) ---
  console.log("=== Evaluating Fine-Tuned (simulated) ===");
  allResults.fineTuned = await evaluateApproach(
    "Fine-Tuned",
    (text) => classifyWithFineTuning(model, text, trainingTickets),
    testSet,
    delayMs
  );
  console.log(`  Accuracy: ${allResults.fineTuned.metrics.accuracy}\n`);

  // Save raw results
  const outputDir = join(__dirname, "..", "data", "results");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, "evaluation-results.json");
  writeFileSync(
    outputPath,
    JSON.stringify(allResults, null, 2)
  );
  console.log(`\nResults saved to ${outputPath}`);

  return allResults;
}

// Standalone run
if (process.argv[1] && process.argv[1].endsWith("evaluate.js")) {
  const results = await runEvaluation();

  console.log("\n=== Summary ===\n");
  for (const [key, data] of Object.entries(results)) {
    console.log(
      `${data.name}: accuracy=${data.metrics.accuracy}, avgLatency=${data.metrics.latency.avg}ms, cost/query=${data.metrics.costPerQuery}`
    );
  }
}
