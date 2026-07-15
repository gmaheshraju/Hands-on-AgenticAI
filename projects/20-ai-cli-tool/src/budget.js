import fs from 'fs';
import path from 'path';
import os from 'os';
import { getModelPricing } from './config.js';

const BUDGET_PATH = path.join(os.homedir(), '.aidev-usage.json');

function loadUsage() {
  try {
    if (fs.existsSync(BUDGET_PATH)) {
      return JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));
    }
  } catch { /* corrupted file */ }
  return { days: {} };
}

function saveUsage(usage) {
  fs.writeFileSync(BUDGET_PATH, JSON.stringify(usage, null, 2) + '\n', 'utf8');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function calculateCost(model, inputTokens, outputTokens) {
  const pricing = getModelPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

export function recordUsage(model, inputTokens, outputTokens, command) {
  const usage = loadUsage();
  const day = todayKey();
  if (!usage.days[day]) {
    usage.days[day] = { total_cost: 0, total_input_tokens: 0, total_output_tokens: 0, operations: [] };
  }
  const { totalCost } = calculateCost(model, inputTokens, outputTokens);
  const dayData = usage.days[day];
  dayData.total_cost += totalCost;
  dayData.total_input_tokens += inputTokens;
  dayData.total_output_tokens += outputTokens;
  dayData.operations.push({
    command,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost: totalCost,
    timestamp: new Date().toISOString(),
  });

  // Keep only last 30 days
  const keys = Object.keys(usage.days).sort();
  while (keys.length > 30) {
    delete usage.days[keys.shift()];
  }

  saveUsage(usage);
  return { totalCost, dayTotal: dayData.total_cost };
}

export function getTodayUsage() {
  const usage = loadUsage();
  const day = todayKey();
  return usage.days[day] || { total_cost: 0, total_input_tokens: 0, total_output_tokens: 0, operations: [] };
}

export function checkBudget(config) {
  const today = getTodayUsage();
  const remaining = config.daily_budget_usd - today.total_cost;
  return {
    spent: today.total_cost,
    budget: config.daily_budget_usd,
    remaining,
    overBudget: remaining <= 0,
    nearBudget: remaining < config.daily_budget_usd * 0.2,
    operations: today.operations.length,
  };
}

export function formatCost(cost) {
  if (cost < 0.001) return '<$0.001';
  return `$${cost.toFixed(4)}`;
}

export function formatTokens(tokens) {
  if (tokens > 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(tokens);
}
