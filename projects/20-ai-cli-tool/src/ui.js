// Terminal UI utilities — colored output, prompts, formatting
// Zero dependencies.

const CODES = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgGreen: '\x1b[42m',
};

let colorEnabled = true;

export function setColor(enabled) {
  colorEnabled = enabled;
}

export function color(text, ...styles) {
  if (!colorEnabled) return text;
  const prefix = styles.map(s => CODES[s] || '').join('');
  return `${prefix}${text}${CODES.reset}`;
}

// Severity badge
export function severityBadge(severity) {
  switch (severity) {
    case 'critical': return color(' CRITICAL ', 'bgRed', 'bold', 'white');
    case 'warning':  return color(' WARNING ', 'bgYellow', 'bold');
    case 'info':     return color(' INFO ', 'blue', 'bold');
    default:         return color(` ${severity.toUpperCase()} `, 'gray');
  }
}

// Category label
export function categoryLabel(cat) {
  const colors = { bug: 'red', security: 'red', performance: 'yellow', style: 'cyan' };
  return color(cat, colors[cat] || 'gray');
}

// Print helpers
export function heading(text) {
  console.log('\n' + color(text, 'bold', 'cyan'));
  console.log(color('─'.repeat(Math.min(text.length + 4, 60)), 'dim'));
}

export function success(text) {
  console.log(color('✓ ', 'green') + text);
}

export function warn(text) {
  console.log(color('⚠ ', 'yellow') + text);
}

export function error(text) {
  console.error(color('✗ ', 'red') + text);
}

export function info(text) {
  console.log(color('ℹ ', 'blue') + text);
}

export function dim(text) {
  console.log(color(text, 'dim'));
}

export function costLine(model, inputTokens, outputTokens, cost) {
  const parts = [
    color(`model: ${model}`, 'dim'),
    color(`tokens: ${inputTokens}→${outputTokens}`, 'dim'),
    color(`cost: ${cost}`, 'dim'),
  ];
  console.log('  ' + parts.join('  │  '));
}

// Interactive prompt — reads a single line from stdin
export function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(color(question, 'yellow'));

    // Handle non-interactive (piped) stdin
    if (!process.stdin.isTTY) {
      resolve('');
      return;
    }

    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(data.trim());
    });
  });
}

// Print a boxed message
export function box(text) {
  const lines = text.split('\n');
  const maxLen = Math.max(...lines.map(l => l.length));
  const border = '┌' + '─'.repeat(maxLen + 2) + '┐';
  const bottom = '└' + '─'.repeat(maxLen + 2) + '┘';

  console.log(color(border, 'dim'));
  for (const line of lines) {
    console.log(color('│ ', 'dim') + line.padEnd(maxLen) + color(' │', 'dim'));
  }
  console.log(color(bottom, 'dim'));
}

// Spinner-like status (simple version for no-dependency approach)
export function status(text) {
  process.stdout.write(color(`  → ${text}...`, 'dim'));
}

export function statusDone() {
  process.stdout.write(' done\n');
}
