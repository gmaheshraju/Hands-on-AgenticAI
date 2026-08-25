"""Spec — 21-multi-agent-coordinator, a timeout that frees a busy slot (L2b — time).

Time flows DOWN. Each retry gets its own handler lifeline, because the whole
finding is that the earlier ones are still running when the later ones start.
Three lifelines that never end is the picture.

WHY IT IS L2b. The check and the reserve are adjacent with no await between them,
so the usual check-then-act race is genuinely absent here -- that part is
correct. What is wrong is the RELEASE: it is issued when a timer wins a race, and
winning that race does not stop the work. Nothing about which values load may
take is violated, so there is nothing for an L2 machine to say. Only the order --
release before the work has actually ended -- shows it.

READING IT. Follow the red decrements. Each one is a claim that the agent is free,
made while the handler above it is still running. The three handler lifelines run
to the bottom of the page on purpose: none of them ever reports back.

No label carries a line number; every citation lives in FACTS.md where it is
machine-checked against this project's source only.
"""

META = {
    "id": "hoa_coordinator_seq_v1",
    "name": "21 Multi-Agent Coordinator — a timeout that frees a busy slot",
    "desc": "The concurrency slot is released when a timeout fires, but a timeout here cancels "
            "nothing. Three handlers ran at once on an agent declaring one, and the registry's "
            "load counter never read above one the whole time.",
    "theme": "hoa-default.json",
    "drawio": "HOA_CoordinatorSeq_v1.drawio", "svg": "coordinator-seq.svg",
    "w": 1700, "h": 1220, "svg_h": 1180,
    "ll_top": 96, "ll_bottom": 856,
}

LIFELINES = [
 ("coord", "component.entry",    "<b>Coordinator</b><br>the retry loop",            180),
 ("reg",   "component.service",  "<b>Registry</b><br>holds the agent's load",       500),
 ("h0",    "component.artifact", "<b>handler</b><br>attempt 0",                     820),
 ("h1",    "component.artifact", "<b>handler</b><br>attempt 1",                    1140),
 ("h2",    "component.artifact", "<b>handler</b><br>attempt 2",                    1460),
]

FRAGMENTS = [
 ("f_loop", "the retry loop — every pass abandons a handler and frees its slot",
  140, 180, 1440, 640),
]

MESSAGES = [
 ("m1",  "coord", "reg",   "selectAgent — load 0, under the cap",            "msg.call",    224),
 ("m2",  "coord", "reg",   "incrementLoad — load is now 1",                  "msg.call",    268),
 ("m3",  "coord", "h0",    "start the handler, raced against a timer",       "msg.call",    312),
 ("m4",  "coord", "coord", "the timer wins the race — the handler does not stop", "msg.failure", 356),
 # The release. Every red arrow below is the same claim: the agent is free, made
 # while the handler above it is still running.
 ("m5",  "coord", "reg",   "decrementLoad — load 0, but attempt 0 is still live", "msg.failure", 400),

 ("m6",  "coord", "reg",   "selectAgent — reads the freed counter, passes",  "msg.call",    444),
 ("m7",  "coord", "reg",   "incrementLoad — load is 1 again",                "msg.call",    488),
 ("m8",  "coord", "h1",    "start a SECOND handler — two are now live",      "msg.call",    532),
 ("m9",  "coord", "coord", "the timer wins again",                           "msg.failure", 576),
 ("m10", "coord", "reg",   "decrementLoad — load 0, two handlers still live","msg.failure", 620),

 ("m11", "coord", "reg",   "selectAgent — passes a third time",              "msg.call",    664),
 ("m12", "coord", "reg",   "incrementLoad — load is 1 again",                "msg.call",    708),
 ("m13", "coord", "h2",    "start a THIRD handler — three are now live",     "msg.call",    752),
 ("m14", "coord", "coord", "retries exhausted; the task is reported failed", "msg.failure", 796),
]

NOTES = [
 ("card_measured","card.failure",
  "<b>MEASURED — THREE AT ONCE ON AN AGENT THAT DECLARED ONE</b><br>"
  "One agent with maxConcurrency 1, a handler taking 900ms, a 200ms task timeout<br>"
  "and two retries. The handler counts itself in and out, so live handlers are<br>"
  "counted directly rather than inferred.<br>"
  "RAN — declared maxConcurrency 1. PEAK concurrent live handlers: 3.<br>"
  "RAN — the load values the registry ever showed: 1 and 0. Maximum observed: 1.<br>"
  "The second line is the one that matters. The cap is not merely exceeded, the<br>"
  "overage is INVISIBLE. Every routing decision that consults load — the sort that<br>"
  "prefers the least loaded agent, and the refusal at the cap — is reading a<br>"
  "number that does not describe the system.<br>"
  "Three rather than two because two retries give three passes, and each pass<br>"
  "leaves its handler behind.", 96, 896, 880, 232),

 ("card_correct","card.invariant",
  "<b>WHAT IS ACTUALLY CORRECT HERE, AND WHY THAT MATTERS</b><br>"
  "The check and the reserve are adjacent with no await between them, so the<br>"
  "ordinary check-then-act race is genuinely absent — two callers cannot both<br>"
  "pass the cap. That part was written carefully.<br>"
  "The defect is the RELEASE. It is issued when a timer wins a race, and winning<br>"
  "that race stops nothing: Promise.race cannot cancel its loser, and nothing<br>"
  "here tries to.<br>"
  "The timeout wraps every skill invocation and defaults to ten seconds, so this<br>"
  "is the ordinary route, not an exotic configuration.<br>"
  "No fix is drawn. Cancelling needs a channel the skill interface does not have,<br>"
  "and holding the slot until the handler settles changes what a timeout means.",
  1008, 896, 612, 232),
]
