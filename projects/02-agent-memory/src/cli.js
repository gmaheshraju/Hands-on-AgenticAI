/**
 * Interactive CLI chat interface for the Personal CRM Agent.
 *
 * Usage: node src/cli.js [--db path/to/db] [--verbose]
 *
 * The agent persists memory to SQLite between sessions.
 * Type 'help' for available commands, 'exit' to quit.
 */

import readline from "readline";
import { CRMAgent } from "./agent.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose") || args.includes("-v");
const dbIdx = args.indexOf("--db");
const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : undefined;

const agent = new CRMAgent({ dbPath, verbose, consolidationThreshold: 5 });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\nYou > ",
});

console.log("╔══════════════════════════════════════════════════╗");
console.log("║          Personal CRM Agent                     ║");
console.log("║  Cross-session memory with consolidation        ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log();

const stats = agent.getStats();
console.log(
  `Loaded: ${stats.episodes} episodes, ${stats.facts} facts, ${stats.procedures} procedures`
);
if (stats.unconsolidated > 0) {
  console.log(`  (${stats.unconsolidated} episodes pending consolidation)`);
}
console.log('\nType "help" for commands, "exit" to quit.\n');

rl.prompt();

rl.on("line", async (line) => {
  const input = line.trim();

  if (!input) {
    rl.prompt();
    return;
  }

  if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
    console.log("\nGoodbye! Your memories are saved.\n");
    agent.close();
    rl.close();
    process.exit(0);
  }

  try {
    const response = await agent.processMessage(input);
    console.log(`\nAgent > ${response}`);
  } catch (err) {
    console.error(`\nError: ${err.message}`);
  }

  rl.prompt();
});

rl.on("close", () => {
  agent.close();
  process.exit(0);
});
