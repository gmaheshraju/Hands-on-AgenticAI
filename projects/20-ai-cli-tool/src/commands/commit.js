import * as git from '../git.js';
import { generateCommitMessage } from '../llm.js';
import { loadConfig, isDemoMode } from '../config.js';
import { checkBudget, formatCost, formatTokens } from '../budget.js';
import * as ui from '../ui.js';

export async function commitCommand(args) {
  const config = loadConfig();

  // Pre-flight checks
  if (!git.isGitRepo()) {
    ui.error('Not a git repository.');
    process.exit(1);
  }

  const diff = git.getStagedDiff();
  if (!diff) {
    ui.error('No staged changes. Stage files with `git add` first.');
    ui.dim('  Tip: git add -p for interactive staging');
    process.exit(1);
  }

  // Budget check
  if (!isDemoMode(config)) {
    const budget = checkBudget(config);
    if (budget.overBudget) {
      ui.warn(`Daily budget exceeded (${formatCost(budget.spent)} / ${formatCost(budget.budget)})`);
      ui.info('Using offline heuristic mode. Set higher budget in ~/.aidev.json');
      config.provider = 'mock'; // Fall back to offline
    } else if (budget.nearBudget) {
      ui.warn(`Approaching daily budget (${formatCost(budget.spent)} / ${formatCost(budget.budget)})`);
    }
  }

  // Show what's staged
  const stat = git.getStagedDiffStat();
  ui.heading('Staged Changes');
  console.log(stat);

  if (isDemoMode(config)) {
    ui.dim('  [demo mode — using heuristic analysis]');
  }

  // Generate message
  console.log('');
  ui.status('Analyzing changes');
  const result = await generateCommitMessage(config, diff);
  ui.statusDone();

  // Show cost
  ui.costLine(result.model, formatTokens(result.inputTokens), formatTokens(result.outputTokens), formatCost(result.cost));

  // Interactive loop
  let message = result.message;
  let action = '';

  while (true) {
    console.log('');
    ui.heading('Commit Message');
    ui.box(message);
    console.log('');

    if (args.includes('--yes') || args.includes('-y')) {
      action = 'y';
    } else {
      const response = await ui.prompt('[a]ccept / [e]dit / [r]egenerate / [q]uit → ');
      action = response.toLowerCase().charAt(0) || 'q';
    }

    if (action === 'a' || action === 'y') {
      // Commit
      try {
        const output = git.commit(message);
        console.log('');
        ui.success('Committed successfully!');
        ui.dim(`  ${output.split('\n')[0]}`);
      } catch (err) {
        ui.error(`Commit failed: ${err.message}`);
        process.exit(1);
      }
      break;

    } else if (action === 'e') {
      const edited = await ui.prompt('Enter commit message: ');
      if (edited) {
        message = edited;
      }
      continue;

    } else if (action === 'r') {
      ui.status('Regenerating');
      const retry = await generateCommitMessage(config, diff);
      ui.statusDone();
      ui.costLine(retry.model, formatTokens(retry.inputTokens), formatTokens(retry.outputTokens), formatCost(retry.cost));
      message = retry.message;
      continue;

    } else {
      ui.info('Aborted — no commit made.');
      break;
    }
  }
}
