import * as git from '../git.js';
import { reviewCode } from '../llm.js';
import { loadConfig, isDemoMode } from '../config.js';
import { checkBudget, formatCost, formatTokens } from '../budget.js';
import * as ui from '../ui.js';

export async function reviewCommand(args) {
  const config = loadConfig();
  const jsonOutput = args.includes('--json');
  const target = args.find(a => !a.startsWith('-'));

  if (jsonOutput) ui.setColor(false);

  // Pre-flight
  if (!git.isGitRepo()) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'Not a git repository' }));
    } else {
      ui.error('Not a git repository.');
    }
    process.exit(1);
  }

  const diff = git.getDiffForReview(target);
  if (!diff) {
    if (jsonOutput) {
      console.log(JSON.stringify({ issues: [], message: 'No changes to review' }));
    } else {
      ui.info('No changes to review.');
      ui.dim('  Usage: aidev review              (review unstaged/staged changes)');
      ui.dim('         aidev review main          (review diff against main branch)');
      ui.dim('         aidev review HEAD~3..HEAD  (review last 3 commits)');
    }
    process.exit(0);
  }

  // Budget check
  if (!isDemoMode(config)) {
    const budget = checkBudget(config);
    if (budget.overBudget) {
      if (!jsonOutput) ui.warn('Daily budget exceeded — using heuristic review.');
      config.provider = 'mock';
    }
  }

  if (!jsonOutput) {
    const files = git.getDiffFiles(target);
    ui.heading('Code Review');
    ui.dim(`  Reviewing ${files.length} file(s)${isDemoMode(config) ? ' [demo mode]' : ''}`);
    console.log('');
    ui.status('Analyzing code');
  }

  const result = await reviewCode(config, diff);

  if (!jsonOutput) {
    ui.statusDone();
    ui.costLine(result.model, formatTokens(result.inputTokens), formatTokens(result.outputTokens), formatCost(result.cost));
    console.log('');
  }

  const { issues } = result;

  // JSON output for CI
  if (jsonOutput) {
    const output = {
      issues,
      summary: {
        total: issues.length,
        critical: issues.filter(i => i.severity === 'critical').length,
        warning: issues.filter(i => i.severity === 'warning').length,
        info: issues.filter(i => i.severity === 'info').length,
      },
      meta: {
        model: result.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost: result.cost,
      },
    };
    console.log(JSON.stringify(output, null, 2));

    // Exit code 1 if critical issues
    if (output.summary.critical > 0) process.exit(1);
    process.exit(0);
  }

  // Pretty output
  if (issues.length === 0) {
    ui.success('No issues found. Code looks good!');
    process.exit(0);
  }

  // Group by severity
  const critical = issues.filter(i => i.severity === 'critical');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  // Summary bar
  const parts = [];
  if (critical.length) parts.push(ui.color(`${critical.length} critical`, 'red', 'bold'));
  if (warnings.length) parts.push(ui.color(`${warnings.length} warning`, 'yellow'));
  if (infos.length) parts.push(ui.color(`${infos.length} info`, 'blue'));
  console.log(`  Found: ${parts.join('  ')}`);
  console.log('');

  // Display each issue
  for (const issue of issues) {
    const badge = ui.severityBadge(issue.severity);
    const cat = ui.categoryLabel(issue.category);
    const location = ui.color(`${issue.file}:${issue.line}`, 'dim');

    console.log(`  ${badge} ${cat}  ${location}`);
    console.log(`    ${issue.message}`);
    if (issue.suggestion) {
      console.log(`    ${ui.color('→', 'green')} ${issue.suggestion}`);
    }
    console.log('');
  }

  // Exit code
  if (critical.length > 0) {
    ui.error(`${critical.length} critical issue(s) found.`);
    process.exit(1);
  }
}
