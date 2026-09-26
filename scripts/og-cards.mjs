#!/usr/bin/env node
// Link-preview cards (og:image / twitter:image), one per blog post plus a site default.
//
//   npm run og        # writes public/og/<slug>.png and public/og/default.png (1200x630)
//
// Dev-time only: it drives the locally installed Google Chrome in headless mode, so the
// PNGs are committed rather than generated in the deploy build. Re-run it when a post
// title, description or diagram changes. Titles and descriptions come from
// src/seo/routes.js, so the card can never disagree with the page's own metadata.

import { mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from '../src/seo/routes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'og');
const diagrams = join(root, 'docs', 'diagrams');

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Which architecture diagram sits behind each post's title. Posts without one get a
// type-only card.
const DIAGRAM = {
  'ai-agent-system-design': 'agent-system-design.png',
  'agent-memory-architecture': 'agent-memory.png',
  'agent-harness-loop-engineering': 'agent-harness.png',
  'multi-agent-systems': 'multi-agent.png',
  'rag-pipeline-deep-dive': 'rag-pipeline.png',
  'llm-ops': 'llm-ops.png',
  'ai-guardrails': 'ai-guardrails.png',
  'evaluation-engineering': 'eval-engineering.png',
  'fine-tuning-vs-rag': 'fine-tuning-vs-rag.png',
  'tool-use-function-calling': 'tool-use-function-calling.png',
  'cost-latency-engineering': 'cost-latency-engineering.png',
  'responsible-ai': 'responsible-ai.png',
  'forward-deployed-engineering': 'forward-deployed-engineering.png',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// "LLMOps: Production LLM Infrastructure" -> "LLMOps"; the rest is subtitle material.
const shortTitle = (t) => t.split(/ — |: /)[0];

function titleHtml(title) {
  const words = esc(title).split(' ');
  if (words.length < 2) return words.join(' ');
  return `${words.slice(0, -1).join(' ')} <em>${words.at(-1)}</em>`;
}

function cardHtml({ eyebrow, title, description, diagram }) {
  const img = diagram && existsSync(join(diagrams, diagram))
    ? `<img class="dia" src="file://${join(diagrams, diagram)}">`
    : `<div class="mono">M</div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#F6F5F0;font-family:'DM Sans',sans-serif;overflow:hidden;position:relative}
.dia{position:absolute;right:-140px;top:70px;width:820px;opacity:.55;border-radius:14px;box-shadow:0 12px 32px rgba(27,27,30,.08);-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 38%)}
.mono{position:absolute;right:40px;top:-80px;font:400 720px/1 'Instrument Serif',serif;color:#E05A2B;opacity:.07}
.bar{position:absolute;left:0;top:0;bottom:0;width:10px;background:#E05A2B}
.txt{position:absolute;left:84px;top:92px;width:640px}
.eb{font:500 17px 'JetBrains Mono',monospace;letter-spacing:.1em;color:#D04A1F;text-transform:uppercase;margin-bottom:26px}
h1{font:400 72px/1.02 'Instrument Serif',serif;color:#1B1B1E;letter-spacing:-.02em;margin-bottom:26px}
h1 em{color:#D04A1F}
p{font-size:23px;line-height:1.5;color:#44444A;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ft{position:absolute;left:84px;bottom:54px;display:flex;align-items:center;gap:14px;font-size:19px;color:#1B1B1E;font-weight:500}
.m{width:40px;height:40px;border-radius:50%;background:#E05A2B;color:#fff;display:grid;place-items:center;font:400 21px 'Instrument Serif',serif}
.u{color:#8E8E96;font-weight:400}
</style></head><body>
<div class="bar"></div>${img}
<div class="txt"><div class="eb">${esc(eyebrow)}</div><h1>${titleHtml(title)}</h1><p>${esc(description)}</p></div>
<div class="ft"><div class="m">M</div>Mahesh Guntumadugu <span class="u">· curiousengineers.in</span></div>
</body></html>`;
}

async function shoot(html, outFile, work) {
  const page = join(work, 'card.html');
  await writeFile(page, html);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--virtual-time-budget=5000', '--window-size=1200,630', `--screenshot=${outFile}`, `file://${page}`,
  ], { stdio: 'ignore' });
  if (!existsSync(outFile)) throw new Error(`Chrome produced no screenshot for ${outFile}`);
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`og-cards: Chrome not found at ${CHROME}. Set CHROME_PATH.`);
    process.exit(2);
  }
  await mkdir(outDir, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), 'og-cards-'));
  try {
    const posts = ROUTES.filter((r) => r.path.startsWith('/blog/'));
    for (const [i, r] of posts.entries()) {
      const slug = r.path.slice('/blog/'.length);
      await shoot(cardHtml({
        eyebrow: `Post ${String(i + 1).padStart(2, '0')} · Agentic AI Playbook`,
        title: shortTitle(r.title),
        description: r.description,
        diagram: DIAGRAM[slug],
      }), join(outDir, `${slug}.png`), work);
      console.log(`og: ${slug}.png`);
    }
    await shoot(cardHtml({
      eyebrow: 'curiousengineers.in',
      title: 'Agentic AI Playbook',
      description: 'Production architecture for AI agents, RAG pipelines and LLM systems, with diagrams drawn from real source code.',
      diagram: 'agent-system-design.png',
    }), join(outDir, 'default.png'), work);
    console.log('og: default.png');
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
