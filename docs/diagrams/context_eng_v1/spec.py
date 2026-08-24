"""Spec — 22-context-engineering, L1 architecture.

CONTENT ONLY. Rendering, invariants and lint live in ../_harness/.
Every element here is cited in FACTS.md; nothing may appear that is not.
"""

META = {
    "id":      "hoa_context_eng_v1",
    "name":    "22 Context Engineering — Context Window Optimizer",
    "desc":    "One in-process Node ESM pipeline that types heterogeneous sources, ranks them by "
               "three interchangeable strategies, fits them into a token budget with a 25% output "
               "reserve, and assembles an attention-ordered message list — plus three subsystems "
               "that are NOT in that path. Every element cites a source line in FACTS.md.",
    "theme":   "hoa-default.json",
    "drawio":  "HOA_ContextEngineering_v1.drawio",
    "svg":     "context-engineering.svg",
    "w": 1700, "h": 1000, "svg_h": 800,
}

# (id, label, boundary-token, x, y, w, h)
ZONES = [
 ("z_in",   "③ In-code inputs — no files, no network", "boundary.datasource",
   40, 184, 200, 320),
 ("z_proc", "① 22-context-engineering — one Node ESM process, 0 dependencies, 0 network calls "
            "(4 moves claimed demo.js:495 — Isolate has no module)", "boundary.primary",
   304, 80, 1000, 700),
 ("z_pipe", "Select — createSource → strategy → allocate → assemble", "boundary.functional",
   320, 160, 960, 224),
 ("z_out",  "④ Return value — nothing is sent anywhere", "boundary.observability",
   1368, 400, 288, 152),
]

# (id, semantic-class, label, x, y, w, h)
NODES = [
 ("n_demo", "component.entry",
  "<b>demo.js</b><br>run() :492, :533<br>8 sections :497-504", 64, 216, 160, 64),
 ("n_corpus", "component.mock",
  "<b>createDemoSources()</b><br>demo.js:48 — 13 srcs<br>in-code, no files", 64, 336, 160, 64),

 ("n_sources", "component.service",
  "<b>createSource()</b><br>sources.js:26 · 6 types<br>rel clamp 0-1 :35", 352, 216, 176, 64),
 ("n_strat", "component.service",
  "<b>strategies.js :111</b><br>greedy :9 relevance :19<br>balanced :44", 592, 216, 176, 64),
 ("n_budget", "component.service",
  "<b>TokenBudget.allocate</b><br>budget.js:30 · 25% out<br>buffer :17 → plan :77", 832, 216, 176, 64),
 ("n_assemble", "component.service",
  "<b>assemble()</b><br>assembler.js:100<br>ORDER :12 → msgs :150<br>+ scratchpad path :218",
  1072, 216, 176, 64),
 ("n_reorder", "component.service",
  "<b>reorderForAttention</b><br>assembler.js:40<br>even→start odd→end :67<br>middle band 0.3-0.7 :81",
  832, 304, 176, 64),

 ("n_tok", "component.service",
  "<b>tokenizer.js</b><br>estimateTokens :92<br>truncateMiddle :220<br>TOKEN_PATTERNS :39 dead",
  352, 440, 176, 64),
 ("n_compact", "component.service",
  "<b>compactConversation</b><br>compactor.js:177<br>keep last 3 turns :178<br>contextAwareCompress:538",
  592, 440, 176, 64),
 ("n_scratch", "component.artifact",
  "<b>Scratchpad</b><br>scratchpad.js:27<br>Map in RAM :38, no file<br>write :55 · index :234",
  832, 440, 176, 64),
 ("n_cache", "component.service",
  "<b>ContextCache</b><br>cache.js:40 · TTL 300s<br>PRICING :16 — no API<br>simulateSession :228",
  1072, 440, 176, 64),

 ("n_ctx", "component.artifact",
  "<b>{ messages, report, totalTokens }</b><br>assembler.js:194 — in-process<br>"
  "no LLM call anywhere in src/", 1392, 448, 240, 64),

 ("card_types", "card.primitive",
  "<b>6 SOURCE TYPES — sources.js:10-15, code order</b><br>"
  "prio 0 SYSTEM_PROMPT :10 — never dropped :40<br>"
  "prio 1 CONVERSATION_HISTORY :11<br>"
  "prio 2 RAG_CHUNKS :12 — RAG tiebreak :137<br>"
  "prio 3 MEMORY :13<br>"
  "prio 4 TOOL_RESULTS :14<br>"
  "prio 5 EXAMPLES :15<br>"
  "within a tier: higher relevanceScore wins :57<br>"
  "assembler ORDER :12-19 repeats all 6 ranks —<br>"
  "a second enumeration that must not drift;<br>"
  "unknown type sorts last via ?? 99 :133", 336, 576, 304, 160),

 ("card_alloc", "card.invariant",
  "<b>allocate() — budget.js:30, the whole contract</b><br>"
  "available = total − floor(total × 0.25) :17-18<br>"
  "pass 1 · every priority-0 source, always :39-45<br>"
  "pass 2 · rest in sortByPriority order :31 :49<br>"
  "· remaining &lt;= 0 → drop budget_exhausted :52<br>"
  "· fits → include at full tokens :56-58<br>"
  "· remaining &gt;= 50 → truncated_to_fit :61-67<br>"
  "· else → drop insufficient_remaining :73<br>"
  "at most ONE source is ever truncated: pass 2<br>"
  "sets remaining = 0 right after it :70<br>"
  "out: included[] truncated[] dropped[] :77-80", 656, 576, 304, 160),

 ("card_fail", "card.failure",
  "<b>4 FAILURE MODES — compactor.js:538, code order</b><br>"
  "1 poisoning :562 — same subj, 2 values :357<br>"
  "2 distraction :563 — &lt;10% core vocab :416<br>"
  "3 confusion :564 — &gt;3 vague, &lt;2 nouns :446<br>"
  "4 clash :565 — opposite polarity :506<br>"
  "ACTED ON — only 3 of the 4:<br>"
  "· distraction: turn deleted :577-580<br>"
  "· poisoning + clash: WARNING prepended :586-600<br>"
  "· confusion: detected, never acted on<br>"
  "quality = 1 − (3p+1d+2c+3k) × 0.05 :610-611<br>"
  "all 4 detectors are module-private", 976, 576, 304, 160),
]

# (id, source, target, label, edge-token, exit(x,y), entry(x,y), waypoints)
EDGES = [
 ("e_demo",   "n_demo",   "n_sources", "boots", "edge.primary", (1, 0.5), (0, 0.25),
   [(288, 248), (288, 232)]),
 ("e_corpus", "n_corpus", "n_sources", "13 sources", "edge.data_in", (1, 0.5), (0, 0.75),
   [(288, 368), (288, 264)]),

 ("e_rank",  "n_sources", "n_strat",    "sources[]",  "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_alloc", "n_strat",   "n_budget",   "allocate()", "edge.primary", (1, 0.5), (0, 0.5), []),
 ("e_plan",  "n_budget",  "n_assemble", "plan",       "edge.primary", (1, 0.5), (0, 0.5), []),

 ("e_reord", "n_assemble", "n_reorder", "reorder :144", "edge.call", (0.25, 1), (1, 0.5),
   [(1116, 336)]),
 ("e_park",  "n_assemble", "n_scratch", "park dropped :225", "edge.call", (0.75, 1), (0.5, 0),
   [(1204, 400), (920, 400)]),
 ("e_ret",   "n_assemble", "n_ctx",     "returns", "edge.artifact", (1, 0.5), (0, 0.5),
   [(1328, 248), (1328, 480)]),

 ("e_tokS", "n_sources",  "n_tok", "estimate :34",  "edge.call", (0.25, 1), (0.25, 0), []),
 ("e_tokA", "n_assemble", "n_tok", "truncate :118", "edge.call", (0.5, 1),  (0.75, 0),
   [(1160, 424), (484, 424)]),
 ("e_tokD", "n_demo",     "n_tok", "BPE :5",        "edge.call", (1, 1), (0, 0.5),
   [(264, 280), (264, 472)]),
 ("e_tokC", "n_compact",  "n_tok", "imports :6",    "edge.call", (0, 0.5), (1, 0.5), []),
 ("e_tokP", "n_scratch",  "n_tok", "imports :9",    "edge.call", (0.5, 1), (0.25, 1),
   [(920, 528), (396, 528)]),
 ("e_tokH", "n_cache",    "n_tok", "imports :9",    "edge.call", (0.5, 1), (0.75, 1),
   [(1160, 552), (484, 552)]),
]
