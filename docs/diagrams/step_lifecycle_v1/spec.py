"""Spec — 23-long-running-agent, step lifecycle (L2 — legality).

The machine is a LOOP, so this is not a pure left-to-right lifecycle. The loop
head sits leftmost and every pass returns to it; the three terminal states are
stacked on the right, where terminals belong. The happy path is the centre row.
The failure row sits BELOW it, and both loop-back edges route ABOVE as reverts,
because they return to a state the machine has already been in.

The point of the picture: only the three states on the right carry a 3px border.
No STEP state is terminal -- a failed step goes to the recovery classifier, and
the classifier decides whether the task lives or dies. That asymmetry is the
whole design, and stroke weight is what makes it visible without reading a word.

The classifier itself is a CARD, not a node. The L2 rules allow four state
classes and no decision pseudo-state, so a guard belongs in a guard card with
its complete enumeration in code order. Drawing it as a box would invent
grammar the rules do not have.

No label carries a line number; every citation lives in FACTS.md where it is
machine-checked against this project's source only.
"""

META = {
    "id": "hoa_step_lifecycle_v1",
    "name": "23 Long-Running Agent — step lifecycle",
    "desc": "The durable executor's real state machine: a loop with three ways out, a six-branch "
            "recovery classifier, and a checkpoint index that decides what a resume re-runs. "
            "No step state is terminal — only the task's three outcomes are.",
    "theme": "hoa-default.json",
    "drawio": "HOA_StepLifecycle_v1.drawio", "svg": "step-lifecycle.svg",
    "w": 1700, "h": 1360, "svg_h": 1312,
}

ZONES = [
 ("z_ex", "src/executor.js — DurableExecutor.execute() decides every step status",
  "boundary.primary", 96, 112, 1552, 680),
]

NODES = [
 ("n_next","state.initial","<b>step i selected</b><br>budget is checked here", 160, 280, 208, 64),
 ("s_running","state.active","<b>running</b><br>handler in flight", 496, 280, 192, 64),
 ("s_done","state.transitional","<b>completed</b><br>step result recorded", 824, 280, 208, 64),
 ("t_taskdone","state.terminal","<b>TASK COMPLETED</b><br>terminal — loop exhausted", 1352, 280, 232, 64),

 ("s_failed","state.transitional","<b>failed</b><br>recovery decides next", 496, 488, 192, 64),
 ("s_skipped","state.transitional","<b>skipped</b><br>loop continues", 824, 488, 208, 64),
 ("t_abort","state.terminal","<b>TASK ABORTED</b><br>terminal — recovery gave up", 1352, 488, 232, 64),

 ("t_budget","state.terminal","<b>BUDGET EXCEEDED</b><br>terminal — stopped at the gate", 1352, 680, 232, 64),

 ("card_classifier","card.invariant",
  "<b>THE RECOVERY CLASSIFIER — COMPLETE, IN CODE ORDER</b><br>"
  "selectStrategy() computes retriesLeft = (step.retries ?? 0) − retriesUsed, then returns the FIRST branch that matches:<br>"
  "1. timeout, retries remain → retry; backoff 100ms × attempt, and the step's timeout is doubled<br>"
  "2. rate limit, retries remain → retry; exponential backoff, capped at 16s<br>"
  "3. auth error → ABORT unconditionally — never retried, never skipped, whatever the step says<br>"
  "4. data / validation / parse error → skip if the step is optional, abort if it is critical<br>"
  "5. any other error, retries remain → retry; backoff 200ms × attempt<br>"
  "6. retries exhausted → skip if optional, abort if critical<br>"
  "Branches 1 and 2 FALL THROUGH: each return sits INSIDE its retries-remain test, so once retries are gone the error is<br>"
  "re-classified by branches 3-6. An exhausted timeout is decided by branch 6, not branch 1.<br>"
  "Branch 1 also matches on error.code, not on the message — the executor's own timeout says 'timed out', which does not<br>"
  "contain the substring 'timeout' that the first half of that test looks for.", 96, 824, 1552, 208),

 ("card_checkpoint","card.invariant",
  "<b>THE CHECKPOINT INDEX IS THE DURABILITY CONTRACT</b><br>"
  "saveCheckpoint stores currentStepIndex, and a resume reads it back as its<br>"
  "starting point. Every call site passes one of exactly two values:<br>"
  "i + 1 — the step finished; resume starts AFTER it. Used on completed, on a<br>"
  "retry that succeeded, and on both kinds of skip.<br>"
  "i — the step did NOT finish; resume RE-RUNS it. Used on the budget stop, on<br>"
  "a critical failure, and on an abort.<br>"
  "So a step that ran halfway and then aborted executes again from the start. A<br>"
  "handler with side effects that is not idempotent applies them twice.", 96, 1064, 760, 176),

 ("card_reported","card.failure",
  "<b>TWO STATUSES ARE REPORTED BUT NEVER STORED</b><br>"
  "On every retry the executor records one status and streams a different one<br>"
  "for the SAME event: the timeline gets 'running', the onProgress callback<br>"
  "gets 'retrying'. RAN — the stream reads running, retrying, retrying,<br>"
  "completed, while the recorded timeline contains no 'retrying' at all.<br>"
  "The budget stop is the mirror image. The event that is both recorded and<br>"
  "streamed says 'aborted', while the value returned to the caller says<br>"
  "'budget_exceeded'. RAN — return budget_exceeded, last streamed aborted.<br>"
  "So the live stream, the stored timeline and the return value are three<br>"
  "vocabularies for the same events. Anything built on one — a dashboard, an<br>"
  "alert, a test — disagrees with the other two.", 888, 1064, 760, 208),
]

EDGES = [
 ("e_run","n_next","s_running","budget.check() passed","transition.normal",(1,0.5),(0,0.5),[]),
 ("e_taskdone","n_next","t_taskdone","no steps left","transition.normal",
  (0.75,0),(0.5,0),[(316,168),(1468,168)]),
 ("e_budget","n_next","t_budget","budget.check() failed","transition.failure",
  (0.5,1),(0,0.5),[(264,712)]),

 ("e_done","s_running","s_done","handler resolved","transition.normal",(1,0.5),(0,0.5),[]),
 ("e_fail","s_running","s_failed","handler threw, or the timeout fired","transition.failure",
  (0.75,1),(0.75,0),[]),

 ("e_next","s_done","n_next","more steps remain — checkpoint at i+1","transition.revert",
  (0.5,0),(0,0.5),[(928,200),(144,200),(144,312)]),

 # Routed out to the LEFT rather than straight up. Both edges are vertical and the
 # renderer centres each label on its longest segment, so two parallel verticals put
 # their labels at the same y and the text collides -- caught by lint's label_overlap.
 # The dog-leg makes this edge's longest segment horizontal, moving its label clear.
 ("e_retry","s_failed","s_running","classifier: retry","transition.revert",
  (0,0.5),(0.25,1),[(432,520),(432,416),(544,416)]),
 ("e_skip","s_failed","s_skipped","classifier: skip","transition.failure",(1,0.5),(0,0.5),[]),
 ("e_abort","s_failed","t_abort","classifier: abort","transition.failure",
  (0.5,1),(0.5,1),[(592,616),(1468,616)]),

 ("e_skipnext","s_skipped","n_next","more steps remain — checkpoint at i+1","transition.revert",
  (1,0.5),(0.5,0),[(1120,520),(1120,232),(264,232)]),
]
