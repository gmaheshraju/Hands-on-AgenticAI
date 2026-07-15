/**
 * Approach 1: Prompt Engineering
 * Zero-shot and few-shot classification with a base model.
 * No retrieval infrastructure, no training — just clever prompts.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const CATEGORIES = ["billing", "technical", "account", "feature-request"];

const FEW_SHOT_EXAMPLES = [
  { text: "I was charged twice for my subscription this month.", category: "billing" },
  { text: "The app crashes every time I try to upload a file larger than 10MB.", category: "technical" },
  { text: "I can't reset my password. The reset email never arrives.", category: "account" },
  { text: "It would be great if you could add dark mode to the mobile app.", category: "feature-request" },
  { text: "My invoice shows the wrong tax rate.", category: "billing" },
  { text: "Getting a 502 Bad Gateway error when accessing the dashboard.", category: "technical" },
  { text: "How do I change the email address associated with my account?", category: "account" },
  { text: "Can you add an option to export reports as CSV files?", category: "feature-request" },
];

/**
 * Zero-shot: just the ticket text and category list, no examples.
 */
export async function classifyZeroShot(model, ticketText) {
  const prompt = `Classify the following customer support ticket into exactly one category.

Categories: ${CATEGORIES.join(", ")}

Ticket: "${ticketText}"

Respond with ONLY the category name, nothing else.`;

  const start = Date.now();
  const result = await model.generateContent(prompt);
  const latency = Date.now() - start;
  const response = result.response.text().trim().toLowerCase();

  // Extract category from response
  const predicted = CATEGORIES.find((c) => response.includes(c)) || response;

  return {
    predicted,
    latency,
    inputTokens: prompt.length / 4, // rough estimate
    approach: "zero-shot",
  };
}

/**
 * Few-shot: 8 labeled examples (2 per category) before the actual ticket.
 */
export async function classifyFewShot(model, ticketText) {
  const examplesStr = FEW_SHOT_EXAMPLES.map(
    (ex) => `Ticket: "${ex.text}"\nCategory: ${ex.category}`
  ).join("\n\n");

  const prompt = `Classify the following customer support ticket into exactly one category.

Categories: ${CATEGORIES.join(", ")}

Here are some examples:

${examplesStr}

Now classify this ticket:
Ticket: "${ticketText}"

Respond with ONLY the category name, nothing else.`;

  const start = Date.now();
  const result = await model.generateContent(prompt);
  const latency = Date.now() - start;
  const response = result.response.text().trim().toLowerCase();

  const predicted = CATEGORIES.find((c) => response.includes(c)) || response;

  return {
    predicted,
    latency,
    inputTokens: prompt.length / 4,
    approach: "few-shot",
  };
}

/**
 * Run both zero-shot and few-shot on a single ticket.
 */
export async function classifyWithPrompting(model, ticketText) {
  const zeroShot = await classifyZeroShot(model, ticketText);
  const fewShot = await classifyFewShot(model, ticketText);
  return { zeroShot, fewShot };
}

// Standalone run
if (process.argv[1] && process.argv[1].endsWith("prompting.js")) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Set GEMINI_API_KEY environment variable");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const testTicket =
    "I was charged twice for my subscription and the app keeps crashing.";
  console.log(`\nTest ticket: "${testTicket}"\n`);

  const { zeroShot, fewShot } = await classifyWithPrompting(model, testTicket);
  console.log("Zero-shot result:", zeroShot);
  console.log("Few-shot result:", fewShot);
}
