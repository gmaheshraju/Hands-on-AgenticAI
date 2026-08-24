"""Spec — 20-ai-cli-tool, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
 "id": "hoa_ai_cli_v1",
 "name": "20 aidev — AI-Powered Developer CLI",
 "desc": "A zero-dependency Node CLI that routes commit / review / explain to an LLM client, "
 "which either runs in-process mock heuristics (demo or over-budget) or calls the real "
 "OpenAI / Anthropic APIs, tracking cost to ~/.aidev-usage.json. Every element cites a "
 "source line in FACTS.md.",
 "theme": "hoa-default.json",
 "drawio": "HOA_AiCli_v1.drawio",
 "svg": "ai-cli.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in", "③ Entry — CLI + git + config", "boundary.datasource",
 40, 176, 224, 536),
 ("z_proc", "① aidev process (Node ESM · zero deps)", "boundary.primary",
 328, 96, 968, 692),
 ("z_flow", "Per-command pipeline — read → analyze (LLM or mock)", "boundary.functional",
 392, 200, 712, 264),
 ("z_ext", "② External LLM APIs (network)", "boundary.external",
 1360, 208, 304, 232),
 ("z_out", "④ Artifacts written — home dir", "boundary.datasource",
 1360, 504, 304, 216),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_cli", "component.entry",
 "<b>bin/aidev.js</b><br>process.argv switch<br>7 verbs + flags", 64, 208, 176, 96),
 ("n_git", "component.service",
 "<b>git.js</b><br>diff / commit / log<br>exec + execFile", 64, 336, 176, 96),
 ("n_config", "component.service",
 "<b>config.js</b><br>~/.aidev.json load/save<br>isDemoMode gate", 64, 480, 176, 96),

 ("n_commit", "component.service",
 "<b>commit.js</b><br>staged diff", 416, 216, 176, 64),
 ("n_review", "component.service",
 "<b>review.js</b><br>diff · --json", 416, 300, 176, 64),
 ("n_explain", "component.service",
 "<b>explain.js</b><br>fs.readFileSync", 416, 384, 176, 64),

 ("n_llm", "component.service",
 "<b>llm.js</b><br>isDemoMode?<br>callLLM dispatch", 664, 300, 176, 96),
 ("n_mock", "component.mock",
 "<b>mock heuristics</b><br>llm.js<br>SIMULATED · cost 0", 904, 308, 176, 64),

 ("n_openai", "component.external",
 "<b>OpenAI API</b><br>api.openai.com<br>/v1/chat/completions", 1384, 240, 256, 64),
 ("n_anthropic", "component.external",
 "<b>Anthropic API</b><br>api.anthropic.com<br>/v1/messages", 1384, 344, 256, 64),

 ("n_budget", "component.service",
 "<b>budget.js</b><br>recordUsage<br>calculateCost", 664, 496, 176, 96),

 ("n_cfgfile", "component.artifact",
 "<b>~/.aidev.json</b><br>config", 1384, 544, 256, 64),
 ("n_usagefile", "component.artifact",
 "<b>~/.aidev-usage.json</b><br>30-day cost ledger", 1384, 640, 256, 64),

 ("card_fallback", "card.invariant",
 "<b>GRACEFUL FALLBACK → mock (no network)</b><br>"
 "isDemoMode = !api_key | provider=mock<br>"
 "demo ⇒ mock heuristics, cost 0<br>"
 "live + overBudget ⇒ provider=mock<br>"
 " commit review explain<br>"
 "budget checked ONLY if !demo<br>"
 "nearBudget warn &lt;20% · over ≤0",
 344, 608, 304, 172),

 ("card_git", "card.primitive",
 "<b>git SAFETY — execFileSync, no shell</b><br>"
 "user input ⇒ execFileSync (safe):<br>"
 " branchDiff reviewTarget<br>"
 " log commit cat files<br>"
 "fixed cmd ⇒ execSync (shell)<br>"
 " isGitRepo staged unstaged<br>"
 " status branch stagedFiles",
 664, 608, 304, 172),

 ("card_providers", "card.primitive",
 "<b>PROVIDERS + 6 PRICED MODELS</b><br>"
 "callLLM: anthropic ⇒ callAnthropic<br>"
 " else ⇒ callOpenAI (default)<br>"
 "models config.js:<br>"
 " gpt-4o-mini · gpt-4o · gpt-4-turbo<br>"
 " claude-haiku-4-5 · sonnet-5 · opus-5<br>"
 "mock priced 0/0<br>"
 "cost = tok/1M × in/out",
 984, 608, 304, 172),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 # CLI routing to the three command verbs (git→review folded into e_git_commit)
 ("e_cli_commit", "n_cli", "n_commit", "commit / c", "edge.primary", (1, 0.25), (0, 0.25),
 []),
 ("e_cli_review", "n_cli", "n_review", "review / r", "edge.primary", (1, 0.5), (0, 0.5),
 [(300, 256), (300, 332)]),
 ("e_cli_explain", "n_cli", "n_explain", "explain / e", "edge.primary", (1, 0.75), (0, 0.5),
 [(340, 280), (340, 416)]),

 # git feeds diffs to the command layer (commit, review; explain uses fs)
 ("e_git_commit", "n_git", "n_commit", "diff read", "edge.data_in", (1, 0.5), (0, 0.75),
 [(372, 384), (372, 264)]),

 # config underpins the run + persists to its file
 ("e_config_cli", "n_config", "n_cli", "loadConfig", "edge.data_in", (0, 0.5), (0, 0.5),
 [(32, 528), (32, 256)]),
 ("e_config_file", "n_config", "n_cfgfile", "save", "edge.artifact", (1, 0.5), (0, 0.5),
 [(280, 528), (280, 600), (1320, 600), (1320, 576)]),

 # commands into the LLM client
 ("e_commit_llm", "n_commit", "n_llm", "commitMsg", "edge.primary", (1, 0.5), (0, 0.25),
 [(624, 248), (624, 324)]),
 ("e_review_llm", "n_review", "n_llm", "review", "edge.primary", (1, 0.5), (0, 0.5),
 [(608, 332), (608, 348)]),
 ("e_explain_llm", "n_explain", "n_llm", "explain", "edge.primary", (1, 0.5), (0, 0.75),
 [(640, 416), (640, 372)]),

 # LLM client forks: mock (in-process) vs real APIs (network)
 ("e_llm_mock", "n_llm", "n_mock", "fallback", "edge.call", (1, 0.5), (0, 0.5),
 [(872, 348), (872, 340)]),
 ("e_llm_oai", "n_llm", "n_openai", "POST chat", "edge.call", (0.75, 0), (0, 0.5),
 [(796, 264), (1320, 264), (1320, 272)]),
 ("e_llm_anth", "n_llm", "n_anthropic", "POST messages", "edge.call", (0.5, 0), (0, 0.5),
 [(752, 240), (1344, 240), (1344, 376)]),

 # cost accounting → usage ledger
 ("e_llm_budget", "n_llm", "n_budget", "recordUsage", "edge.primary", (0.5, 1), (0.5, 0),
 []),
 ("e_budget_file", "n_budget", "n_usagefile", "saveUsage", "edge.artifact", (1, 0.5), (0, 0.5),
 [(1344, 544), (1344, 672)]),
]
