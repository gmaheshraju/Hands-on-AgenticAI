import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.aidev.json');

const DEFAULTS = {
  api_key: '',
  model: 'gpt-4o-mini',
  provider: 'openai',  // openai | anthropic | mock
  daily_budget_usd: 1.00,
  max_tokens_per_request: 4096,
  conventional_commit: true,
  color: true,
};

// Model pricing per 1M tokens (input/output)
const MODEL_PRICING = {
  'gpt-4o-mini':      { input: 0.15,  output: 0.60 },
  'gpt-4o':           { input: 2.50,  output: 10.00 },
  'gpt-4-turbo':      { input: 10.00, output: 30.00 },
  'claude-3-haiku':   { input: 0.25,  output: 1.25 },
  'claude-3-sonnet':  { input: 3.00,  output: 15.00 },
  'claude-3-opus':    { input: 15.00, output: 75.00 },
  'claude-sonnet-4':  { input: 3.00,  output: 15.00 },
  'claude-opus-4':    { input: 15.00, output: 75.00 },
  'mock':             { input: 0,     output: 0 },
};

export function loadConfig() {
  let stored = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      stored = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch {
    // Corrupted config — use defaults
  }
  return { ...DEFAULTS, ...stored };
}

export function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export function getModelPricing(model) {
  return MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
}

export function isDemoMode(config) {
  return !config.api_key || config.provider === 'mock';
}

export { CONFIG_PATH, DEFAULTS, MODEL_PRICING };
