#!/usr/bin/env node

import { commitCommand } from '../src/commands/commit.js';
import { reviewCommand } from '../src/commands/review.js';
import { explainCommand } from '../src/commands/explain.js';
import { loadConfig, saveConfig, isDemoMode, CONFIG_PATH } from '../src/config.js';
import { checkBudget, formatCost, getTodayUsage } from '../src/budget.js';
import { runDemo } from '../src/demo.js';
import * as ui from '../src/ui.js';

const VERSION = '1.0.0';

// ── Argument parsing ──

const args = process.argv.slice(2);
const command = args[0];
const subArgs = args.slice(1);

// Global flags
if (args.includes('--no-color')) ui.setColor(false);

// ── Commands ──

async function main() {
  try {
    switch (command) {
      case 'commit':
      case 'c':
        await commitCommand(subArgs);
        break;

      case 'review':
      case 'r':
        await reviewCommand(subArgs);
        break;

      case 'explain':
      case 'e':
        await explainCommand(subArgs);
        break;

      case 'config':
        configCommand(subArgs);
        break;

      case 'status':
      case 'budget':
        statusCommand();
        break;

      case 'demo':
        runDemo();
        break;

      case '--version':
      case '-v':
        console.log(`aidev v${VERSION}`);
        break;

      case '--help':
      case '-h':
      case 'help':
      case undefined:
        showHelp();
        break;

      default:
        ui.error(`Unknown command: ${command}`);
        console.log('Run `aidev --help` for usage.');
        process.exit(1);
    }
  } catch (err) {
    ui.error(err.message);
    if (args.includes('--verbose')) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// ── Config command ──

function configCommand(subArgs) {
  const config = loadConfig();

  if (subArgs.includes('--path')) {
    console.log(CONFIG_PATH);
    return;
  }

  // Set a value: --set key=value
  const setArg = subArgs.find(a => a.startsWith('--set'));
  if (setArg) {
    const setIdx = subArgs.indexOf(setArg);
    let pair;
    if (setArg.includes('=') && setArg !== '--set') {
      // --set=key=value format
      pair = setArg.replace('--set=', '');
    } else {
      // --set key=value format
      pair = subArgs[setIdx + 1];
    }

    if (!pair || !pair.includes('=')) {
      ui.error('Usage: aidev config --set key=value');
      ui.dim('  Example: aidev config --set api_key=sk-...');
      process.exit(1);
    }

    const eqIdx = pair.indexOf('=');
    const key = pair.slice(0, eqIdx);
    let value = pair.slice(eqIdx + 1);

    // Type coercion
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^\d+\.?\d*$/.test(value)) value = parseFloat(value);

    config[key] = value;
    saveConfig(config);
    ui.success(`Set ${key} = ${typeof value === 'string' && key.includes('key') ? value.slice(0, 8) + '...' : value}`);
    return;
  }

  // Show config
  ui.heading('Configuration');
  console.log(`  Path: ${ui.color(CONFIG_PATH, 'dim')}`);
  console.log('');
  for (const [key, value] of Object.entries(config)) {
    let displayVal = value;
    if (key.includes('key') && typeof value === 'string' && value.length > 8) {
      displayVal = value.slice(0, 8) + '...';
    }
    if (value === '') displayVal = ui.color('(not set)', 'dim');
    console.log(`  ${ui.color(key, 'cyan')}: ${displayVal}`);
  }
  console.log('');
  ui.dim(`  Mode: ${isDemoMode(config) ? 'demo (no API key)' : 'live (' + config.provider + ')'}`);
}

// ── Status/budget command ──

function statusCommand() {
  const config = loadConfig();
  const budget = checkBudget(config);
  const today = getTodayUsage();

  ui.heading('Usage Status');
  console.log('');
  console.log(`  ${ui.color('Today:', 'bold')}`);
  console.log(`    Spent:      ${formatCost(budget.spent)}`);
  console.log(`    Budget:     ${formatCost(budget.budget)}`);
  console.log(`    Remaining:  ${budget.overBudget ? ui.color(formatCost(budget.remaining), 'red') : formatCost(budget.remaining)}`);
  console.log(`    Operations: ${budget.operations}`);
  console.log('');

  if (today.operations.length > 0) {
    console.log(`  ${ui.color('Recent operations:', 'bold')}`);
    for (const op of today.operations.slice(-10)) {
      const time = new Date(op.timestamp).toLocaleTimeString();
      console.log(`    ${ui.color(time, 'dim')}  ${op.command.padEnd(8)}  ${op.model.padEnd(16)}  ${formatCost(op.cost)}`);
    }
    console.log('');
  }

  console.log(`  ${ui.color('Mode:', 'bold')} ${isDemoMode(config) ? 'demo' : 'live'}`);
  console.log(`  ${ui.color('Model:', 'bold')} ${config.model}`);
  console.log('');
}

// ── Help ──

function showHelp() {
  console.log(`
${ui.color('aidev', 'bold', 'cyan')} v${VERSION} — AI-powered developer CLI

${ui.color('USAGE', 'bold')}
  aidev <command> [options]

${ui.color('COMMANDS', 'bold')}
  ${ui.color('commit', 'cyan')}  (c)    Generate a commit message from staged changes
  ${ui.color('review', 'cyan')}  (r)    Review code for bugs, security, and style issues
  ${ui.color('explain', 'cyan')} (e)    Explain what a file does
  ${ui.color('config', 'cyan')}         View or set configuration
  ${ui.color('status', 'cyan')}         Show token usage and budget
  ${ui.color('demo', 'cyan')}           Show demo mode info

${ui.color('COMMIT OPTIONS', 'bold')}
  -y, --yes           Auto-accept the generated message

${ui.color('REVIEW OPTIONS', 'bold')}
  --json              Output as JSON (for CI integration)
  <target>            Diff target (e.g., main, HEAD~3..HEAD)

${ui.color('EXPLAIN OPTIONS', 'bold')}
  --json              Output as JSON
  <file>              File to explain

${ui.color('CONFIG OPTIONS', 'bold')}
  --set key=value     Set a config value
  --path              Show config file path

${ui.color('GLOBAL OPTIONS', 'bold')}
  --no-color          Disable colored output
  --verbose           Show error stack traces
  -v, --version       Show version
  -h, --help          Show this help

${ui.color('EXAMPLES', 'bold')}
  ${ui.color('$', 'dim')} aidev commit                  # Generate commit message
  ${ui.color('$', 'dim')} aidev review                  # Review unstaged changes
  ${ui.color('$', 'dim')} aidev review main --json      # Review vs main, JSON output
  ${ui.color('$', 'dim')} aidev explain src/server.js   # Explain a file
  ${ui.color('$', 'dim')} aidev config --set api_key=sk-abc123
  ${ui.color('$', 'dim')} aidev config --set provider=openai
  ${ui.color('$', 'dim')} aidev status                  # Check daily budget

${ui.color('SETUP', 'bold')}
  Works out of the box in demo mode (heuristic analysis).
  For LLM-powered results, configure an API key:

    aidev config --set api_key=YOUR_KEY
    aidev config --set provider=openai   ${ui.color('# or anthropic', 'dim')}

  Config stored in: ~/.aidev.json
  Usage tracked in: ~/.aidev-usage.json
`);
}

main();
