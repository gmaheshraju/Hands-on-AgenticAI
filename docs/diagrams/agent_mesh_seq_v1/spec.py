"""Spec — 29-agent-mesh, submitWork over time (L2b — time).

Time flows DOWN. Declaration order IS reading order, and the build asserts it:
a sequence whose messages are declared out of order would be a false claim about
what happened first, which is the only claim this altitude exists to make.

WHY THIS PROJECT. The defect on this page is invisible at the other two
altitudes. The exclude call and the re-include call are both Mesh talking to
MeshRouter, so on an L1 map they are one arrow; neither drives an illegal state,
so an L2 machine shows nothing wrong. Only the ORDER -- one undoing the other,
one attempt later -- makes it visible. That is the argument for the altitude,
and it is why this diagram exists rather than a fourth state machine.

READING IT. Inside the loop, the router is asked to forget the tried nodes, pick
one, and then remember them again. The re-include is drawn as a REVERT because
that is what it does: it puts back a node the breaker had just removed. Follow
the orange arrow, then look at the red one two rows above it -- they are the
whole finding, and their distance apart on the page is the bug.

No label carries a line number; every citation lives in FACTS.md where it is
machine-checked against this project's source only.
"""

META = {
    "id": "hoa_agent_mesh_seq_v1",
    "name": "29 Agent Mesh — submitWork over time",
    "desc": "One attempt of the mesh's retry loop, in order: the router is asked to forget the "
            "tried nodes, pick one, and remember them again — and that last step silently puts "
            "back a node the circuit breaker removed two messages earlier. Verified by execution.",
    "theme": "hoa-default.json",
    "drawio": "HOA_AgentMeshSeq_v1.drawio", "svg": "agent-mesh-seq.svg",
    "w": 1700, "h": 1280, "svg_h": 1240,
    "ll_top": 96, "ll_bottom": 960,
}

LIFELINES = [
 ("caller",   "component.entry",   "<b>caller</b><br>awaits submitWork",            200),
 ("mesh",     "component.service", "<b>Mesh</b><br>owns the retry loop",            520),
 ("router",   "component.agent",   "<b>MeshRouter</b><br>holds _excludedNodes",     840),
 ("breaker",  "component.external","<b>CircuitBreakerRegistry</b><br>one breaker per node", 1180),
 ("node",     "component.artifact","<b>AgentNode</b><br>runs the work",            1500),
]

FRAGMENTS = [
 ("f_loop", "loop — attempt 0 through maxRetries",   400, 264, 1220, 624),
 ("f_alt1", "alt — the breaker refuses",             440, 536, 1140, 128),
 ("f_alt2", "else — the breaker allows",             440, 680, 1140, 180),
]

MESSAGES = [
 ("m1",  "caller",  "mesh",    "submitWork(item, strategy)",                       "msg.call",    224),

 ("m2",  "mesh",    "router",  "excludeNode(id) for each tried node — none on the first attempt",
                                                                                   "msg.call",    308),
 ("m3",  "mesh",    "router",  "selectNode(item, strategy)",                       "msg.call",    360),
 ("m4",  "router",  "mesh",    "the chosen node, or null",                         "msg.return",  412),
 # THE finding. Its label names the relationship rather than the call, because the
 # call alone looks harmless -- it is what it undoes, one pass later, that matters.
 ("m5",  "mesh",    "router",
  "includeNode(id) for each tried node still HEALTHY — undoes the red exclusion below, next pass",
                                                                                   "msg.revert",  464),

 ("m6",  "mesh",    "breaker", "allowRequest(node.id)",                            "msg.call",    516),
 ("m7",  "breaker", "mesh",    "false — this breaker is OPEN",                     "msg.failure", 568),
 ("m8",  "mesh",    "router",  "excludeNode(node.id) — then continue to the next attempt",
                                                                                   "msg.failure", 620),

 ("m9",  "mesh",    "node",    "await node.enqueue(item)",                         "msg.call",    700),
 ("m10", "node",    "mesh",    "result",                                           "msg.return",  752),
 ("m11", "mesh",    "breaker", "recordSuccess(id) — or recordFailure(id) if it threw",
                                                                                   "msg.call",    804),
 ("m12", "mesh",    "caller",  "work_completed record",                            "msg.return",  856),

 ("m13", "mesh",    "caller",  "throw — 'no healthy node available'",              "msg.failure", 920),
]

NOTES = [
 ("note_finding","card.failure",
  "<b>THE ORDERING DEFECT — THE RE-INCLUDE UNDOES THE EXCLUSION</b><br>"
  "The breaker refuses a node, so the mesh excludes it from routing. On the NEXT<br>"
  "attempt the mesh excludes every tried node, picks another, and then re-includes<br>"
  "the tried ones — testing HEALTH, which knows nothing about breaker state. The<br>"
  "condemned node is healthy, so it goes back into the routing pool.<br>"
  "RAN — the instrumented calls for one submitWork read: select node_1, exclude<br>"
  "node_1, exclude node_1, select node_2, include node_1. The breaker is still<br>"
  "OPEN and the excluded set is EMPTY.<br>"
  "RAN — four consecutive calls then pick the condemned node FIRST every time,<br>"
  "four out of four, and it completes zero work. Each pass burns one attempt.<br>"
  "RAN — with two condemned nodes and a two-attempt budget, submitWork THROWS<br>"
  "'no healthy node available' while a healthy idle node was never selected. In<br>"
  "that case the thrown message is false.", 96, 1000, 880, 232),

 ("note_gate","card.invariant",
  "<b>WHAT STILL HOLDS, AND WHY THE FIX IS NOT 'DELETE THE RE-INCLUDE'</b><br>"
  "No work is ever misrouted. The breaker is re-asked on every attempt, so a<br>"
  "condemned node is refused each time — the cost is a wasted attempt, not a<br>"
  "wrong destination.<br>"
  "The re-include is also not gratuitous. The mesh excludes tried nodes only to<br>"
  "stop selectNode returning them again inside THIS call, and it has to undo<br>"
  "that so other work can still route to them.<br>"
  "The real defect is that a temporary exclusion and a durable one are kept in<br>"
  "the SAME set, with no record of who excluded a node or why. Separating those<br>"
  "two is a design decision, so this diagram states the finding and stops<br>"
  "there.<br>"
  "A node marked FAILED by the health monitor is unaffected — it fails the<br>"
  "HEALTHY test and is never re-included.", 1008, 1000, 612, 232),
]
