"""Spec — 23-long-running-agent, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_long_running_v1",
    "name":    "23 Long-Running Agent — Durable Execution Engine",
    "desc":    "One Node process, zero dependencies, that walks a task's steps in order, gates each one "
               "on a budget, checkpoints after every outcome, and asks a seven-branch recovery ladder "
               "what to do when a step throws. The checkpoint store is an in-memory Map and the work "
               "surface is simulated: both corrections are carried on the boxes. Every element cites a "
               "source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_LongRunning_v1.drawio",
    "svg":     "long-running.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_entry", "③ Entry — demo, tests, tasks", "boundary.datasource",
   40, 216, 216, 376),
 ("z_proc",  "① 23-long-running-agent — one Node process, zero deps", "boundary.primary",
   320, 96, 976, 684),
 ("z_loop",  "Durable step loop — executor.js:65-185", "boundary.functional",
   536, 200, 504, 176),
 ("z_ext",   "② Work surface — SIMULATED", "boundary.external",
   1360, 216, 296, 176),
 ("z_out",   "④ Output — stdout", "boundary.observability",
   1360, 496, 296, 128),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
  "<b>demo.js</b><br>4 scenarios · main :171<br>:44 :70 :100 :143", 64, 248, 176, 64),
 ("n_tests", "component.entry",
  "<b>agent.test.js</b><br>27 tests · 6 suites<br>rollback's only caller", 64, 368, 176, 64),
 ("n_tasks", "component.mock",
  "<b>tasks.js — 4 tasks</b><br>24 steps · :22 :43<br>:77 :108 · SIMULATED<br>setTimeout only :8",
  64, 464, 176, 64),

 ("n_exec", "component.service",
  "<b>DurableExecutor</b><br>execute() :36 — the loop<br>budget+reporter per run<br>"
  "exits :81 :155 :177 :187<br>injects store :19 +<br>recoveryManager :20",
  336, 256, 176, 96),

 ("n_budget", "component.service",
  "<b>ExecutionBudget</b><br>budget.js:7 · check :45<br>record :34 · report :64<br>new per execute() :38",
  560, 272, 176, 64),
 ("n_step", "component.service",
  "<b>#executeStep()</b><br>executor.js:200<br>setTimeout :208 +<br>clearTimeout :224 :240",
  800, 272, 176, 64),
 ("n_handler", "component.agent",
  "<b>step.handler() — SIMULATED</b><br>awaited at executor.js:216<br>every handler = simulateWork<br>"
  "tasks.js:8 — setTimeout, no I/O",
  1400, 272, 240, 64),

 ("n_ckpt", "component.artifact",
  "<b>CheckpointStore</b><br>checkpoint.js:7 — Map :9<br>IN-MEMORY, not durable<br>save :17 · load :35",
  336, 460, 176, 64),
 ("n_recovery", "component.service",
  "<b>RecoveryManager</b><br>recovery.js:8 · injected<br>selectStrategy :19<br>applyRollback :101",
  608, 460, 176, 64),
 ("n_progress", "component.service",
  "<b>ProgressReporter</b><br>progress.js:4 · per run<br>record :19 · 6 icons :55<br>timeline :54 · ETA :39",
  880, 460, 176, 64),

 ("n_out", "component.artifact",
  "<b>stdout — the only output</b><br>demo.js:61 :63 :90 :138 :162<br>timeline · budget · progress<br>"
  "no file is ever written",
  1400, 528, 240, 64),

 ("card_rec", "card.primitive",
  "<b>selectStrategy() recovery.js:19 — 7 branches, in code order</b><br>"
  "1 timeout | code TIMEOUT + retries left → retry, 100ms×n, t×2 :24<br>"
  "2 rate limit | 429 | RATE_LIMIT + retries → retry, 2ⁿ s cap 16s :38<br>"
  "3 auth | 401 | 403 | code AUTH → abort — never recoverable :52<br>"
  "4 data | validation | parse, non-critical step → skip :59 :61<br>"
  "5 data | validation | parse, critical step → abort :65<br>"
  "6 any other error, retries left → retry, 200ms×n :71<br>"
  "7 retries exhausted → skip if non-critical :82, else abort :87<br>"
  "FALL-THROUGH: 1 and 2 do NOT return when retries hit 0 — they<br>"
  "drop to branch 7. Only branch 3 returns unconditionally.<br>"
  "'rollback' is in the return type :17 and is never returned.",
  336, 600, 456, 160),

 ("card_dur", "card.invariant",
  "<b>DURABILITY — the checkpoint store is a Map, checkpoint.js:9</b><br>"
  "save() from 7 sites, all inside execute(): :79 :98 :138 :148<br>"
  "  :153 :170 :175 — on abort as well as on success<br>"
  "kept: currentStepIndex, completedSteps, 4 budget counters :256<br>"
  "dropped: the step result payload — {...s, result: undefined} :258<br>"
  "no file, no DB, no serialisation to disk anywhere in the repo<br>"
  "the demo crash is a thrown Error tasks.js:90, caught in-process<br>"
  "a real process exit takes the Map with it — resume is in-RAM<br>"
  "budget.restore() :87 does not restore #startTime budget.js:25<br>"
  "so the maxDuration clock restarts at zero on every resume<br>"
  "observed: 8 steps → 8 checkpoints (demo.js:65, run 2026-08-24)",
  816, 600, 456, 160),

 ("card_bud", "card.failure",
  "<b>BUDGET IS A FLOOR, NOT A CEILING</b><br>"
  "check() runs BEFORE a step :69<br>"
  "record() runs AFTER it returns :229<br>"
  "→ the step that breaches the cap still<br>"
  "runs in full and is still billed<br>"
  "observed: $0.1200 spent vs $0.1000 cap<br>"
  "3 limits, all ≥ : cost :47, seconds :51,<br>"
  "calls :54 — calls counts steps :38<br>"
  "all default to Infinity :21 = no gate",
  1360, 656, 296, 132),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_demo",  "n_demo",  "n_exec", "execute(task)",     "edge.primary",  (1, 0.25), (0, 0.25),
   [(312, 264), (312, 280)]),
 ("e_tasks", "n_tasks", "n_exec", "task defs",         "edge.data_in", (1, 0.5), (0, 0.5),
   [(296, 496), (296, 304)]),
 ("e_onprog", "n_exec", "n_demo", "onProgress :236",   "edge.call",     (0, 0.75), (0.5, 1),
   [(272, 328), (272, 344), (152, 344)]),
 ("e_tests", "n_tests", "n_recovery", "sole caller :101", "edge.call",  (1, 0.5), (0.5, 0),
   [(272, 400), (272, 432), (696, 432)]),

 ("e_loop",  "n_exec",   "n_budget",  "per step",       "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_ok",    "n_budget", "n_step",    "ok :70",         "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_call",  "n_step",   "n_handler", "await handler()", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_usage", "n_handler", "n_budget", "cost + tokens",  "edge.data_in", (0.25, 0), (0.25, 0),
   [(1460, 248), (604, 248)]),

 ("e_fail",  "n_step", "n_recovery", "on throw :103",   "edge.stop",    (0.25, 1), (0.75, 0),
   [(844, 444), (740, 444)]),
 ("e_strat", "n_recovery", "n_exec", "strategy",        "edge.analysis", (0, 0.5), (1, 0.75),
   [(524, 492), (524, 328)]),
 ("e_event", "n_step", "n_progress", "record :235",     "edge.call",    (0.75, 1), (0.5, 0),
   [(932, 444), (968, 444)]),

 ("e_save",  "n_exec", "n_ckpt", "save ×7",             "edge.artifact", (0.5, 1), (0.5, 0), []),
 ("e_load",  "n_ckpt", "n_exec", "resume",              "edge.data_in",  (0.25, 0), (0.25, 1), []),

 ("e_report", "n_budget", "n_out", "budget.report()",   "edge.artifact", (0.5, 1), (0.5, 0),
   [(648, 364), (1256, 364), (1256, 440), (1520, 440)]),
 ("e_timeline", "n_progress", "n_out", "timeline + ETA", "edge.artifact", (1, 0.5), (0, 0.5),
   [(1320, 492), (1320, 560)]),
]
