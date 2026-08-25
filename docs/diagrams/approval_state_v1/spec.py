"""Spec — 25-agent-executor, ApprovalRequest lifecycle (L2 — legality).

Lifecycle reads LEFT to RIGHT: birth leftmost, terminal states rightmost.
The happy path (submit -> pending -> approved) is the centre row. Refusals and
the timeout sweep route BELOW. The auto-approve birth routes ABOVE, because it
skips the pending state entirely and never enters the Map.

escalate() is drawn as a SELF-LOOP on PENDING. That is the finding: it raises
escalationLevel and returns status 'escalated', but never writes .status, so it
is not a transition at all. A self-loop is the honest shape for it.

Terminal states carry a 3px border. Here that is four of the five states -- the
opposite balance from the workflow engine, and the point of the picture.

No label carries a line number; every citation lives in FACTS.md where it is
machine-checked. Labels name METHODS instead, which stay true across edits.
"""

META = {
    "id": "hoa_approval_state_v1",
    "name": "25 Agent Executor — ApprovalRequest lifecycle",
    "desc": "The approval queue's real state machine: one live state, four terminal ones, and "
            "a guard that is not the guard it claims to be. No transition table exists here — "
            "terminality is enforced by removal from a Map. Two findings verified by execution.",
    "theme": "hoa-default.json",
    "drawio": "HOA_ApprovalState_v1.drawio", "svg": "approval-state.svg",
    "w": 1480, "h": 940, "svg_h": 920,
}

ZONES = [
 ("z_q", "src/approvals.js — ApprovalQueue owns every write to .status", "boundary.primary",
  96, 64, 1200, 608),
]

NODES = [
 ("n_submit","state.initial","<b>submit(request)</b><br>the only entry", 160, 264, 176, 64),
 ("s_pending","state.active","<b>pending</b><br>the only live state", 464, 264, 208, 64),

 ("s_auto","state.terminal","<b>auto_approved</b><br>born already decided", 1000, 120, 224, 64),
 ("s_appr","state.terminal","<b>approved</b><br>then deleted from the Map", 1000, 264, 224, 64),
 ("s_deny","state.terminal","<b>denied</b><br>then deleted from the Map", 1000, 408, 224, 64),
 ("s_exp","state.terminal","<b>expired</b><br>swept, then deleted", 1000, 552, 224, 64),

 ("card_guard","card.invariant",
  "<b>THE GUARD IS THE MAP, NOT THE STATUS CHECK</b><br>"
  "approve() and deny() each test status !== 'pending' and return<br>"
  "'already_decided'. That branch is UNREACHABLE. Every decision<br>"
  "deletes from the Map first, so a second call returns at the<br>"
  "earlier guard instead — RAN: it gives 'not_found', never<br>"
  "'already_decided'. No record inside the Map can hold a<br>"
  "non-pending status. The request is still refused correctly;<br>"
  "what is wrong is the REASON a reader will believe.", 160, 704, 592, 176),

 ("card_escalated","card.failure",
  "<b>'escalated' IS REPORTED, NEVER STORED</b><br>"
  "escalate() raises escalationLevel and returns a payload saying<br>"
  "status 'escalated' — but never assigns .status. The record stays<br>"
  "'pending'. RAN: the call reports level 1 while the record reads<br>"
  "status 'pending', escalationLevel 1.<br>"
  "So getHistory filtered on status 'escalated' matches 0 records,<br>"
  "always. The word exists in the return channel and nowhere in<br>"
  "the data — which is why escalate is drawn as a self-loop.", 808, 704, 608, 176),
]

EDGES = [
 ("e_auto","n_submit","s_auto","a rule in autoApproveRules matched","transition.normal",
  (0.5,0),(0,0.5),[(248,152)]),
 ("e_pend","n_submit","s_pending","no rule matched","transition.normal",(1,0.5),(0,0.5),[]),
 ("e_appr","s_pending","s_appr","approve(id, approver)","transition.normal",(1,0.5),(0,0.5),[]),
 ("e_deny","s_pending","s_deny","deny(id, approver, reason)","transition.failure",
  (0.5,1),(0,0.5),[(568,440)]),
 ("e_exp","s_pending","s_exp","checkExpired() sweep: now past expiresAt","transition.failure",
  (0.75,1),(0,0.5),[(620,584)]),
 ("e_esc","s_pending","s_pending","escalate() — level++, status unchanged","transition.revert",
  (0.25,0),(0.75,0),[(516,200),(620,200)]),
]
