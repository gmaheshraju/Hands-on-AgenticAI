"""Spec — 18-workflow-engine, WorkflowRun state machine (L2 — legality).

Lifecycle reads LEFT to RIGHT: initial leftmost, terminal rightmost.
Happy path on the centre row. Failure paths route BELOW. The revert
(WAITING_APPROVAL -> RUNNING) routes ABOVE, because it goes back to a state the
run already left. Terminal states carry a 3px border so where the machine can
STOP is visible at a glance.
"""

META = {
    "id": "hoa_workflow_state_v1",
    "name": "18 Workflow Engine — WorkflowRun state machine",
    "desc": "The complete legal state machine of a workflow run: five states, six permitted "
            "transitions, two terminal, enforced by a table that throws on any move it does not "
            "contain. Every state and edge cites its call site in FACTS.md.",
    "theme": "hoa-default.json",
    "drawio": "HOA_WorkflowState_v1.drawio", "svg": "workflow-state.svg",
    "w": 1700, "h": 1000, "svg_h": 760,
}

ZONES = [
 ("z_sm", "core/state.js — the ONLY writer of run.status", "boundary.primary", 96, 128, 1360, 400),
]

NODES = [
 ("s_pending","state.initial","<b>PENDING</b><br>constructed, not started", 160, 264, 176, 64),
 ("s_running","state.active","<b>RUNNING</b><br>walking the DAG", 464, 264, 176, 64),
 ("s_wait","state.transitional","<b>WAITING_APPROVAL</b><br>paused at an approval node", 768, 264, 192, 64),
 ("s_done","state.terminal","<b>COMPLETED</b><br>terminal — no transitions out", 1160, 200, 208, 64),
 ("s_failed","state.terminal","<b>FAILED</b><br>terminal — no transitions out", 1160, 384, 208, 64),

 ("card_enforce","card.invariant",
  "<b>ENFORCEMENT IS THE TABLE, NOT A CONVENTION</b><br>"
  "transition() reads VALID_TRANSITIONS[status] and THROWS<br>"
  "\"Invalid transition: from → to\" when the target is absent.<br>"
  "An illegal move cannot be performed; it raises.<br>"
  "Every accepted move logs a state_change trace with {from, to}.", 160, 568, 528, 128),

 ("card_swallow","card.failure",
  "<b>THE ONE SWALLOWED FAILURE — engine.js</b><br>"
  "try { run.transition('FAILED') } catch (_) { /* already failed */ }<br>"
  "The only transition() call wrapped in a bare catch. FAILED is<br>"
  "terminal, so a second failure throws and that throw is discarded.<br>"
  "The guard still holds — no illegal state is reached. What is lost<br>"
  "is the signal, if it ever fires for another reason.", 736, 568, 560, 144),
]

EDGES = [
 ("t_start","s_pending","s_running","run starts","transition.normal",(1,0.5),(0,0.5),[]),
 ("t_wait","s_running","s_wait","next node is type 'approval'","transition.normal",(1,0.5),(0,0.5),[]),
 ("t_resume","s_wait","s_running","approval node completed","transition.revert",(0.5,0),(0.5,0),[(864,208),(552,208)]),
 ("t_done","s_running","s_done","DAG finished, no unhandled error","transition.normal",(0.75,0),(0,0.5),[(596,232),(1160,232)]),
 ("t_fail","s_running","s_failed","a non-optional node threw","transition.failure",(0.5,1),(0,0.5),[(552,416)]),
 ("t_wfail","s_wait","s_failed","fails while paused","transition.failure",(0.5,1),(0.5,1),[(864,504),(1264,504)]),
]
