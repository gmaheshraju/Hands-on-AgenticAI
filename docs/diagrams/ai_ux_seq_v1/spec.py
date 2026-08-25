"""Spec — 12-ai-ux, Stop pressed during a HITL pause (L2b — time).

Time flows DOWN. The stop request arrives on its own lifeline because it IS a
separate request -- that separateness is the defect, not an implementation
detail.

WHY IT IS L2b. Every read of the abort flag is correct. aborted is a plain
boolean with no transition table, so there is nothing for an L2 machine to
describe, and an L1 map would show a stop endpoint that sets a flag the stream
loop reads, which is true and sounds fine. What is wrong is WHEN: between the two
reads there is an await that may never resolve, and that hole is exactly where
the user is most likely to press the button.

READING IT. The fragment marks the parked window. Both reads of the flag sit
OUTSIDE it -- one above, one below -- and everything the stop endpoint does
happens inside. The red return is the lie: two hundred, ok true, while nothing
stopped.

No label carries a line number; every citation lives in FACTS.md where it is
machine-checked against this project's source only.
"""

META = {
    "id": "hoa_ai_ux_seq_v1",
    "name": "12 AI UX — Stop pressed during a HITL pause",
    "desc": "The stream parks on an approval promise, and while it is parked no read of the abort "
            "flag is reachable. Stop answers ok, sends no terminal event, closes nothing and "
            "frees nothing. Driven over real HTTP against the running server.",
    "theme": "hoa-default.json",
    "drawio": "HOA_AiUxSeq_v1.drawio", "svg": "ai-ux-seq.svg",
    "w": 1700, "h": 1180, "svg_h": 1140,
    "ll_top": 96, "ll_bottom": 816,
}

LIFELINES = [
 ("browser", "component.entry",    "<b>browser</b><br>holds the SSE connection",     180),
 ("loop",    "component.service",  "<b>SSE handler</b><br>the async event loop",     500),
 ("state",   "component.artifact", "<b>streamState</b><br>{ scenarioName, aborted }", 820),
 ("pending", "component.agent",    "<b>pendingApprovals</b><br>actionId to resolve", 1140),
 ("stop",    "component.external", "<b>POST /stop</b><br>a separate request",        1460),
]

FRAGMENTS = [
 ("f_parked", "the parked window — no read of aborted is reachable in here",
  140, 384, 1440, 308),
]

MESSAGES = [
 ("m1",  "browser", "loop",    "GET /api/chat/stream",                             "msg.call",    224),
 ("m2",  "loop",    "state",   "read aborted at the top of the loop — false",      "msg.call",    268),
 ("m3",  "loop",    "browser", "stream_start, thinking, token",                    "msg.return",  312),

 ("m4",  "loop",    "browser", "hitl_request — asking the user to approve",        "msg.return",  356),
 ("m5",  "loop",    "pending", "store resolve, then await it",                     "msg.call",    424),

 ("m6",  "browser", "stop",    "the user presses Stop",                            "msg.call",    468),
 ("m7",  "stop",    "state",   "aborted = true",                                   "msg.call",    512),
 # The lie. It is a true statement about what the endpoint did, and a false one
 # about what happened, which is why it is drawn as a failure.
 ("m8",  "stop",    "browser", "200 { ok: true } — but nothing was stopped",       "msg.failure", 556),

 ("m9",  "loop",    "loop",    "still awaiting — the flag is never consulted here", "msg.failure", 600),
 ("m10", "browser", "stop",    "Stop again — still 200, so the entry is still held","msg.call",    644),

 ("m11", "loop",    "browser", "stream_stop — NEVER SENT",                         "msg.failure", 712),
 ("m12", "loop",    "state",   "the second read of aborted — NEVER REACHED",       "msg.failure", 756),
]

NOTES = [
 ("card_measured","card.failure",
  "<b>MEASURED — AGAINST THE RUNNING SERVER, OVER REAL HTTP</b><br>"
  "A message matching the send-email scenario, so the stream reaches a HITL pause.<br>"
  "RAN — reached the HITL await: true. Events so far: stream_start, thinking,<br>"
  "token, hitl_request.<br>"
  "RAN — POST to the stop endpoint replied 200 with ok true.<br>"
  "Two and a half seconds later: stream_stop received false, done received false,<br>"
  "SSE connection closed false, and not one new event had arrived.<br>"
  "RAN — a second stop for the same id still returned 200, which proves the entry<br>"
  "is still in activeStreams.<br>"
  "The endpoint reports success because it succeeded at what it does: it set a<br>"
  "boolean. Nothing that would read that boolean can run.", 96, 856, 880, 232),

 ("card_left","card.invariant",
  "<b>WHAT IS LEFT BEHIND, AND THE ONE PATH THAT CLEANS UP</b><br>"
  "Because the handler never leaves the await, none of its exits run: no<br>"
  "stream_stop is sent, res.end is never reached on either exit, and neither map<br>"
  "entry is deleted. pendingApprovals is freed only by the resolve handler, which<br>"
  "is the very call that was never made.<br>"
  "The client is left believing a stream is live that will never produce another<br>"
  "byte.<br>"
  "One path does clean up: if the BROWSER disconnects, the close handler sets the<br>"
  "flag and drops the stream from activeStreams. It cannot unpark the promise<br>"
  "either, so the async function outlives the client that created it — and a stop<br>"
  "for that id then answers 404 while the handler is still parked.", 1008, 856, 612, 232),
]
