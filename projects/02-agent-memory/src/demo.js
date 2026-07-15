/**
 * Demo — walks through a realistic CRM scenario showing:
 *   1. Logging interactions across "sessions"
 *   2. Consolidation firing and extracting semantic facts
 *   3. Querying by person, topic, and call prep
 *   4. Conflict resolution when facts change (e.g., company change)
 *   5. Memory persistence across sessions
 */

import { CRMAgent } from "./agent.js";
import { MemoryStore } from "./memory.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_DB = path.join(__dirname, "..", "demo_crm.db");

// Clean slate for each demo run
if (fs.existsSync(DEMO_DB)) fs.unlinkSync(DEMO_DB);

async function runDemo() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     Personal CRM — Cross-Session Memory Demo           ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ─── Session 1: Conference interactions ───────────────────────────
  console.log("━".repeat(60));
  console.log("SESSION 1: KubeCon Conference");
  console.log("━".repeat(60));

  const agent = new CRMAgent({
    dbPath: DEMO_DB,
    verbose: true,
    consolidationThreshold: 5,
  });

  const session1Inputs = [
    "met Priya at KubeCon, she leads platform eng at Stripe, interested in our observability stack",
    "met Raj during the Kafka talk at KubeCon, he works at Datadog on their streaming pipeline",
    "talked to Sarah from Google, she runs the Kubernetes SIG-network group, expert in service mesh",
    "met Chen at the after-party, he heads ML infrastructure at Netflix, interested in feature stores",
    "chatted with Lisa at KubeCon, she works at HashiCorp on Terraform provider ecosystem",
  ];

  for (const input of session1Inputs) {
    console.log(`\n  You > ${input}`);
    const response = await agent.processMessage(input);
    console.log(`  Agent > ${response}`);
  }

  // Show stats after consolidation
  console.log("\n  You > stats");
  console.log(`  Agent > ${await agent.processMessage("stats")}`);

  agent.close();

  // ─── Session 2: Follow-up interactions ────────────────────────────
  console.log("\n" + "━".repeat(60));
  console.log("SESSION 2: Post-Conference Follow-ups (new session, same DB)");
  console.log("━".repeat(60));

  const agent2 = new CRMAgent({
    dbPath: DEMO_DB,
    verbose: true,
    consolidationThreshold: 5,
  });

  // Show that memory persists
  console.log("\n  [Memory loaded from previous session]");
  const stats = agent2.getStats();
  console.log(
    `  Episodes: ${stats.episodes}, Facts: ${stats.facts}, Procedures: ${stats.procedures}\n`
  );

  const session2Inputs = [
    "met Alex at a Rust meetup, he works at Cloudflare on Workers runtime, knows a lot about WebAssembly",
    "spoke with Priya again on a call, she mentioned Stripe is migrating to gRPC, wants to compare notes on our migration",
    "Raj knows about Kafka Connect deeply, he offered to review our connector setup",
    "had a call with Nina from Uber, she leads their real-time analytics team, experienced with Flink and Kafka",
    "talked to Ben from Vercel, he works on their edge runtime, interested in our serverless architecture",
  ];

  for (const input of session2Inputs) {
    console.log(`\n  You > ${input}`);
    const response = await agent2.processMessage(input);
    console.log(`  Agent > ${response}`);
  }

  agent2.close();

  // ─── Session 3: Queries and conflict resolution ───────────────────
  console.log("\n" + "━".repeat(60));
  console.log("SESSION 3: Querying Memory + Conflict Resolution");
  console.log("━".repeat(60));

  const agent3 = new CRMAgent({
    dbPath: DEMO_DB,
    verbose: true,
    consolidationThreshold: 5,
  });

  // Query: who knows about Kafka?
  console.log("\n  You > who knows about Kafka?");
  console.log(`  Agent > ${await agent3.processMessage("who knows about Kafka?")}`);

  // Query: what do I know about Priya?
  console.log("\n  You > what do I know about Priya?");
  console.log(
    `  Agent > ${await agent3.processMessage("what do I know about Priya?")}`
  );

  // Conflict resolution: Priya changes company
  console.log("\n  --- CONFLICT RESOLUTION TEST ---");
  console.log("\n  You > Priya moved to Datadog as VP of Platform");
  console.log(
    `  Agent > ${await agent3.processMessage("Priya moved to Datadog as VP of Platform")}`
  );

  // Verify the update
  console.log("\n  You > what do I know about Priya?");
  console.log(
    `  Agent > ${await agent3.processMessage("what do I know about Priya?")}`
  );

  // Call prep
  console.log("\n  You > prep me for my call with Chen");
  console.log(
    `  Agent > ${await agent3.processMessage("prep me for my call with Chen")}`
  );

  // Topic search
  console.log("\n  You > who knows about infrastructure?");
  console.log(
    `  Agent > ${await agent3.processMessage("who knows about infrastructure?")}`
  );

  // List all facts
  console.log("\n  You > facts");
  console.log(`  Agent > ${await agent3.processMessage("facts")}`);

  // Final stats
  console.log("\n  You > stats");
  console.log(`  Agent > ${await agent3.processMessage("stats")}`);

  agent3.close();

  // ─── Session 4: Scale test — bulk contacts ────────────────────────
  console.log("\n" + "━".repeat(60));
  console.log("SESSION 4: Scale Test — 20 more contacts");
  console.log("━".repeat(60));

  const agent4 = new CRMAgent({
    dbPath: DEMO_DB,
    verbose: false,
    consolidationThreshold: 5,
  });

  const bulkContacts = [
    "met David at AWS re:Invent, he leads DynamoDB team, expert in distributed databases",
    "talked to Emma from Confluent, she works on Kafka Streams, interested in event sourcing",
    "met Frank at a Go meetup, he works at Grafana Labs on Loki, knows about log aggregation",
    "chatted with Grace from Meta, she heads the React Server Components team",
    "met Hiro at a ML conference, he works at OpenAI on fine-tuning infrastructure",
    "spoke with Iris from Databricks, she leads Spark optimization team, expert in query planning",
    "met Jake at DockerCon, he works at Red Hat on Podman, knows about container runtimes",
    "talked to Karen from Shopify, she runs their checkout platform, experienced with payment systems",
    "met Leo at a security conference, he works at CrowdStrike on threat detection, expert in SIEM",
    "chatted with Maya from Snowflake, she heads data sharing team, interested in data mesh",
    "met Oscar from Pinterest, he works on their recommendation engine, expert in collaborative filtering",
    "spoke with Pat from Elastic, she leads the Elasticsearch team, knows about search relevance",
    "met Quinn at a DevOps meetup, he works at PagerDuty on incident response automation",
    "talked to Rosa from Square, she runs their API platform, experienced with GraphQL at scale",
    "met Sam at a Rust conference, he works at AWS on Firecracker, expert in microVMs",
    "chatted with Tara from Twilio, she heads their messaging infrastructure, knows about pub/sub at scale",
    "met Uma from Airbnb, she works on their search ranking, experienced with ML inference",
    "spoke with Victor from GitHub, he leads Copilot infrastructure, interested in code generation",
    "met Wendy at re:Invent, she works at Supabase on their Postgres extensions",
    "talked to Yuki from LINE, she runs their chat infrastructure, expert in WebSocket scaling",
  ];

  for (const input of bulkContacts) {
    const response = await agent4.processMessage(input);
    // Only print a summary, not every response
    process.stdout.write(".");
  }
  console.log(" done!\n");

  // Query the larger dataset
  console.log("  You > who knows about Kafka?");
  console.log(
    `  Agent > ${await agent4.processMessage("who knows about Kafka?")}`
  );

  console.log("\n  You > who knows about infrastructure?");
  console.log(
    `  Agent > ${await agent4.processMessage("who knows about infrastructure?")}`
  );

  // Final stats
  const finalStats = agent4.getStats();
  console.log("\n  Final memory state:");
  console.log(`    Total episodes:   ${finalStats.episodes}`);
  console.log(`    Semantic facts:   ${finalStats.facts}`);
  console.log(`    Procedures:       ${finalStats.procedures}`);
  console.log(`    Pending consolidation: ${finalStats.unconsolidated}`);

  // Latency test
  const start = Date.now();
  await agent4.processMessage("who knows about distributed systems?");
  const elapsed = Date.now() - start;
  console.log(`\n  Retrieval latency: ${elapsed}ms (target: <500ms)`);

  agent4.close();

  console.log("\n" + "━".repeat(60));
  console.log("Demo complete! Run 'npm run chat' for interactive mode.");
  console.log("━".repeat(60));
}

runDemo().catch(console.error);
