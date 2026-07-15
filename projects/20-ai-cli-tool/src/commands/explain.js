import fs from 'fs';
import path from 'path';
import { explainFile } from '../llm.js';
import { loadConfig, isDemoMode } from '../config.js';
import { checkBudget, formatCost, formatTokens } from '../budget.js';
import * as ui from '../ui.js';

export async function explainCommand(args) {
  const config = loadConfig();
  const jsonOutput = args.includes('--json');
  const filePath = args.find(a => !a.startsWith('-'));

  if (jsonOutput) ui.setColor(false);

  if (!filePath) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'No file specified' }));
    } else {
      ui.error('No file specified.');
      ui.dim('  Usage: aidev explain <file>');
      ui.dim('  Example: aidev explain src/server.js');
    }
    process.exit(1);
  }

  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `File not found: ${filePath}` }));
    } else {
      ui.error(`File not found: ${filePath}`);
    }
    process.exit(1);
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Cannot explain a directory. Specify a file.' }));
    } else {
      ui.error('Cannot explain a directory. Specify a file.');
    }
    process.exit(1);
  }

  // Size guard
  if (stat.size > 500 * 1024) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'File too large (>500KB)' }));
    } else {
      ui.error(`File too large (${(stat.size / 1024).toFixed(0)}KB). Max 500KB.`);
    }
    process.exit(1);
  }

  const content = fs.readFileSync(resolved, 'utf8');

  // Budget check
  if (!isDemoMode(config)) {
    const budget = checkBudget(config);
    if (budget.overBudget) {
      if (!jsonOutput) ui.warn('Daily budget exceeded — using heuristic analysis.');
      config.provider = 'mock';
    }
  }

  if (!jsonOutput) {
    ui.heading(`Explaining: ${filePath}`);
    ui.dim(`  ${content.split('\n').length} lines, ${(stat.size / 1024).toFixed(1)}KB${isDemoMode(config) ? ' [demo mode]' : ''}`);
    console.log('');
    ui.status('Analyzing file');
  }

  const result = await explainFile(config, content, filePath);

  if (!jsonOutput) {
    ui.statusDone();
    ui.costLine(result.model, formatTokens(result.inputTokens), formatTokens(result.outputTokens), formatCost(result.cost));
    console.log('');
  }

  const { explanation } = result;

  // JSON output
  if (jsonOutput) {
    console.log(JSON.stringify({
      file: filePath,
      ...explanation,
      meta: {
        model: result.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost: result.cost,
      },
    }, null, 2));
    process.exit(0);
  }

  // Pretty output
  console.log(`  ${ui.color('Summary:', 'bold')} ${explanation.summary}`);
  console.log('');

  if (explanation.purpose) {
    console.log(`  ${ui.color('Purpose:', 'bold')} ${explanation.purpose}`);
    console.log('');
  }

  if (explanation.key_functions?.length) {
    console.log(`  ${ui.color('Key Functions:', 'bold')}`);
    for (const fn of explanation.key_functions) {
      console.log(`    ${ui.color('•', 'cyan')} ${fn}`);
    }
    console.log('');
  }

  if (explanation.dependencies?.length) {
    console.log(`  ${ui.color('Dependencies:', 'bold')}`);
    for (const dep of explanation.dependencies) {
      console.log(`    ${ui.color('•', 'dim')} ${dep}`);
    }
    console.log('');
  }

  if (explanation.complexity) {
    const complexColor = { low: 'green', medium: 'yellow', high: 'red' };
    console.log(`  ${ui.color('Complexity:', 'bold')} ${ui.color(explanation.complexity, complexColor[explanation.complexity] || 'gray')}`);
  }

  console.log('');
}
