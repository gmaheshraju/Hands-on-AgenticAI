"""Spec — 24-llm-gateway, two requests against one budget (L2b — time).

Time flows DOWN. Two request flows get their own lifelines because the defect is
between them, not inside either one; the shared counters and the awaited provider
get the other three.

WHY THIS ONE IS THE CLEANEST L2b IN THE SET. Run the same eight requests
sequentially and the cap behaves correctly. Run them concurrently and the
identical code overspends. The control experiment falsifies the lower altitude
by itself -- nothing about which transitions are legal changed, so there is
nothing for a state machine to say. Only the order moved.

READING IT. The top fragment is four messages long and contains both reads. The
bottom fragment contains both writes. Everything expensive happens between them.
B asks the same question A did and gets the same answer, because at that instant
the answer is still true -- that is the whole defect, and it is why the second
read is labelled by its RELATIONSHIP to the first rather than by its call.

No label carries a line number; every citation lives in FACTS.md where it is
machine-checked against this project's source only.
"""

META = {
    "id": "hoa_gateway_budget_seq_v1",
    "name": "24 LLM Gateway — two requests, one budget",
    "desc": "Both requests read the spend counter before either writes to it, with two awaits in "
            "between. The same eight requests spend eight times as much concurrently as they do "
            "sequentially, and seven refusals become none. Measured, both orderings.",
    "theme": "hoa-default.json",
    "drawio": "HOA_GatewayBudgetSeq_v1.drawio", "svg": "gateway-budget-seq.svg",
    "w": 1700, "h": 1220, "svg_h": 1180,
    "ll_top": 96, "ll_bottom": 856,
}

LIFELINES = [
 ("req_a",   "component.entry",   "<b>Request A</b><br>one call to request()",        200),
 ("req_b",   "component.entry",   "<b>Request B</b><br>a second, concurrent",         520),
 ("tracker", "component.service", "<b>CostTracker</b><br>holds today's records",      840),
 ("limiter", "component.agent",   "<b>RateLimiter</b><br>holds the team's buckets",  1180),
 ("provider","component.external","<b>provider</b><br>the awaited model call",       1500),
]

# Three acts, and the middle one is the diagram's argument. Each fragment spans far
# enough right to include every lifeline it touches -- the first version stopped short
# of RateLimiter while framing messages that write to it, and framed only the budget
# reads while claiming to frame "the counters".
FRAGMENTS = [
 ("f_reads",  "both requests read the counters — neither has written yet",   140, 176, 1120, 280),
 ("f_gap",    "the gap — two awaits, and nothing is reserved",               140, 464, 1420, 132),
 ("f_writes", "both requests write — by now the cap is long gone",           140, 604, 1120, 216),
]

MESSAGES = [
 ("m1",  "req_a",   "tracker",  "checkBudget(teamId)",                         "msg.call",    224),
 ("m2",  "tracker", "req_a",    "allowed — spent $0.00",                       "msg.return",  268),
 ("m3",  "req_b",   "tracker",  "checkBudget(teamId)",                         "msg.call",    312),
 # Labelled by its RELATIONSHIP to m2, not by the call. The call is unremarkable;
 # that it returns the SAME answer is the entire finding.
 ("m4",  "tracker", "req_b",    "allowed — spent $0.00, the same answer A got", "msg.return", 356),

 ("m5",  "req_a",   "limiter",  "check(teamId, ESTIMATED tokens)",             "msg.call",    400),
 ("m6",  "req_b",   "limiter",  "check(teamId, ESTIMATED tokens)",             "msg.call",    444),

 ("m7",  "req_a",   "provider", "await — middleware, then the model call",     "msg.call",    488),
 ("m8",  "req_b",   "provider", "await — the same two awaits",                 "msg.call",    532),
 ("m9",  "provider","req_a",    "response + usage",                            "msg.return",  576),

 ("m10", "req_a",   "limiter",  "consume(ACTUAL tokens)",                      "msg.call",    620),
 ("m11", "req_a",   "tracker",  "record(costUsd) — the cap is crossed here",   "msg.call",    664),

 ("m12", "provider","req_b",    "response + usage",                            "msg.return",  708),
 ("m13", "req_b",   "limiter",  "consume(ACTUAL tokens)",                      "msg.call",    752),
 ("m14", "req_b",   "tracker",  "record(costUsd) — B cleared every gate long ago", "msg.failure", 796),
]

NOTES = [
 ("card_measured","card.failure",
  "<b>MEASURED — THE SAME EIGHT REQUESTS, TWO ORDERINGS</b><br>"
  "Cap $0.10 a day. One request alone costs $0.18, so the very first one already<br>"
  "crosses it.<br>"
  "RAN concurrent, n=8 — executed 8, blocked 0, spend $1.44.<br>"
  "RAN sequential, n=8 — executed 1, blocked 7, spend $0.18.<br>"
  "Eight times the spend, and seven refusals turned into none, from interleaving<br>"
  "alone. The dollar figure is not a property of the code — it scales with whatever<br>"
  "the provider reports. The reproducible quantity is the ratio: with n concurrent<br>"
  "requests that each exceed the cap, n execute where one should.<br>"
  "The cap logic itself is CORRECT, and the sequential run is the proof. That is<br>"
  "what makes this an ordering defect and not a legality one.", 96, 896, 880, 232),

 ("card_pattern","card.invariant",
  "<b>THE SAME SHAPE TWICE, IN ONE FUNCTION</b><br>"
  "The rate limiter has the identical gap — checked at step two, consumed at step<br>"
  "seven, the same two awaits in between.<br>"
  "RAN, 12,000 tokens a minute with each call using 10,000 —<br>"
  "concurrent n=6: rate-limited 0, executed 6.<br>"
  "sequential n=6: rate-limited 4, executed 2.<br>"
  "One asymmetry survives even serialisation: the check is made against an<br>"
  "ESTIMATE of the tokens, while the debit is the ACTUAL usage the provider<br>"
  "returned. The amount tested and the amount charged are different numbers by<br>"
  "construction.<br>"
  "No fix is drawn. Reserving at check time changes what happens to a request<br>"
  "that fails after reserving, and that is a design decision.", 1008, 896, 612, 232),
]
