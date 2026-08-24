"""Spec — 02-agent-memory (Personal CRM Agent, cross-session memory), L1 architecture."""

META = {
 "id": "hoa_agent_memory_v1",
 "name": "02 Agent Memory — Personal CRM Agent",
 "desc": "A CLI agent that logs every turn as an episodic SQLite row, consolidates episodes into "
 "semantic facts with contradiction and decay hygiene, and answers queries through hybrid "
 "retrieval — all state persisted in one on-disk SQLite file so memory survives restarts.",
 "theme": "hoa-default.json",
 "drawio": "HOA_AgentMemory_v1.drawio", "svg": "agent-memory.svg",
 "w": 1700, "h": 1000, "svg_h": 800,
}

ZONES = [
 ("z_entry", "③ Entry points", "boundary.datasource", 40, 200, 240, 292),
 ("z_proc", "① CRM agent process (Node ESM)", "boundary.primary", 344, 96, 936, 680),
 ("z_flow", "Turn → consolidate → retrieve (one continuous flow)", "boundary.functional", 376, 196, 872, 200),
 ("z_ext", "② External driver", "boundary.external", 1344, 200, 296, 168),
 ("z_out", "④ Durable state", "boundary.observability", 1344, 432, 296, 180),
]

NODES = [
 ("n_cli","component.entry","<b>cli.js</b><br>interactive readline", 64, 236, 160, 64),
 ("n_demo","component.entry","<b>demo.js</b><br>4-session demo", 64, 380, 160, 64),
 ("n_agent","component.service","<b>CRMAgent</b><br>classify · route", 408, 252, 176, 64),
 ("n_consol","component.service","<b>Consolidation</b><br>consolidation.js", 664, 252, 176, 64),
 ("n_retr","component.service","<b>Retrieval</b><br>hybrid FTS", 936, 252, 176, 64),
 ("n_memory","component.service","<b>MemoryStore</b><br>3 memory types", 664, 400, 176, 64),
 ("n_mockllm","component.mock","<b>Mock extractor</b><br>regex fallback", 408, 500, 176, 56),
 ("n_sqlite","component.external","<b>better-sqlite3</b><br>sync driver · package.json", 1368, 248, 248, 64),
 ("n_dbfile","component.artifact","<b>crm_memory.db</b><br>all three memory types<br>memory.js", 1368, 484, 248, 72),
 ("card_gate","card.invariant",
 "<b>CONSOLIDATION GATE — when it fires</b><br>"
 "1 unconsolidatedCount = countUnconsolidated()<br>"
 "2 urgent = count &gt; 0 AND raw_input matches<br>"
 "3 NOT urgent AND count &lt; threshold → return ran:false<br>"
 "4 else gather (urgent ? all : threshold, oldest first)", 408, 596, 456, 116),
 ("card_fact","card.invariant",
 "<b>addFact — create vs update</b><br>"
 "1 query existing row: subject+predicate<br>"
 "2 none → INSERT (created)<br>"
 "3 exists → detectContradiction, merge sources<br>"
 "4 contradiction → halve existing confidence in place<br>"
 "5 else UPDATE object · confidence · sources", 904, 400, 344, 148),
 ("card_decay","card.invariant",
 "<b>decayMemories — per-fact outcome</b><br>"
 "ageDays ≤ 0 → untouched<br>"
 "else confidence × 2^(−ageDays / halfLife)<br>"
 "&lt; archiveThreshold (0.1) → archived + stale<br>"
 "else Δ &gt; 0.001 → updated, otherwise untouched", 904, 604, 344, 128),
]

EDGES = [
 ("e_cli","n_cli","n_agent","process(turn)","edge.primary",(1,0.5),(0,0.25),[]),
 ("e_demo","n_demo","n_agent","process(turn)","edge.primary",(1,0.5),(0,0.75),[(304,412),(304,300)]),
 ("e_con","n_agent","n_consol","runConsolidation","edge.primary",(1,0.5),(0,0.5),[]),
 ("e_ret","n_agent","n_retr","retrieve / retrievePerson","edge.primary",(0.5,0),(0.5,0),[(496,224),(1024,224)]),
 ("e_ep","n_agent","n_memory","addEpisode","edge.call",(0.75,1),(0,0.5),[(540,432)]),
 ("e_c2m","n_consol","n_memory","read + write facts","edge.data_in",(0.5,1),(0.5,0),[]),
 ("e_r2m","n_retr","n_memory","FTS + direct search","edge.data_in",(0.5,1),(0.75,0),[(1024,368),(796,368)]),
 ("e_mock","n_consol","n_mockllm","extractFacts fallback","edge.call",(0.25,1),(0.5,0),[(708,348),(496,348)]),
 ("e_drv","n_memory","n_sqlite","Database() driver","edge.call",(1,0.25),(0,0.5),[(864,416),(864,556),(1296,556),(1296,280)]),
 ("e_db","n_memory","n_dbfile","persist WAL","edge.artifact",(1,0.75),(0,0.5),[(888,448),(888,580),(1320,580),(1320,520)]),
]
