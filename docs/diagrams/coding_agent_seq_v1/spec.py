"""Spec — 16-ai-coding-agent, two fixes to one file (L2b — time).

Time flows DOWN. There is no concurrency on this page at all -- it is a plain for
loop -- and that is the point worth making: an ordering defect does not need two
threads. It needs a read phase separated from a write phase, which is exactly
what this code has.

WHY IT IS L2b AND NOT L1. An L1 map would draw a coder that reads files and
writes files. True, and it says nothing. The defect is that EVERY read happens
before ANY write, so two steps touching one file both compute from the same
pre-write bytes. Only the order shows it, and there is no mutated status field
anywhere, so there is nothing for an L2 machine to say either.

READING IT. The top fragment holds both reads. The bottom holds both writes. The
second read is labelled by its RELATIONSHIP to the first -- that it returns
identical bytes is the finding, not that a read happened. Follow the red write:
it is computed from a version of the file that no longer exists by the time it
lands.

No label carries a line number; every citation lives in FACTS.md where it is
machine-checked against this project's source only.
"""

META = {
    "id": "hoa_coding_agent_seq_v1",
    "name": "16 AI Coding Agent — two fixes to one file",
    "desc": "Every plan step reads the file before any step writes it, so two fixes to one file "
            "are both computed from the same pre-write bytes. Both are reported applied, one "
            "survives, and the pull request shows a reviewer the diff that was reverted.",
    "theme": "hoa-default.json",
    "drawio": "HOA_CodingAgentSeq_v1.drawio", "svg": "coding-agent-seq.svg",
    "w": 1700, "h": 1220, "svg_h": 1180,
    "ll_top": 96, "ll_bottom": 856,
}

LIFELINES = [
 ("agent", "component.entry",    "<b>Agent</b><br>calls the two phases",        200),
 ("coder", "component.service",  "<b>Coder</b><br>executePlan, applyChanges",   560),
 ("disk",  "component.artifact", "<b>src/app.js</b><br>the file on disk",       920),
 ("pr",    "component.external", "<b>PR body</b><br>written from the changes", 1280),
]

FRAGMENTS = [
 ("f_reads",  "every step reads before any step writes",                    140, 248, 1060, 264),
 ("f_writes", "both writes take the same path; the second overwrites",      140, 600, 1060, 88),
]

MESSAGES = [
 ("m1",  "agent", "coder", "executePlan(plan, explorer)",                       "msg.call",    224),

 ("m2",  "coder", "disk",  "readFile — for the step that guards the user lookup","msg.call",   268),
 ("m3",  "disk",  "coder", "twelve lines, no guards",                           "msg.return",  312),
 ("m4",  "coder", "coder", "compute the new content from those bytes",          "msg.call",    356),

 ("m5",  "coder", "disk",  "readFile — for the step that guards the todo lookup","msg.call",   400),
 # Labelled by its RELATIONSHIP to m3. A second read is unremarkable; that it
 # returns byte-identical content is the whole defect.
 ("m6",  "disk",  "coder", "the SAME twelve lines — nothing has been written yet","msg.return",444),
 ("m7",  "coder", "coder", "compute from the same bytes again",                 "msg.call",    488),

 ("m8",  "coder", "agent", "two changes, each carrying its own diff",           "msg.return",  532),
 ("m9",  "agent", "coder", "applyChanges()",                                    "msg.call",    576),

 ("m10", "coder", "disk",  "write the first — the user guard lands",            "msg.call",    620),
 ("m11", "coder", "disk",  "write the second — computed without the user guard","msg.failure",  664),

 ("m12", "coder", "agent", "applied — two files, no conflict reported",         "msg.return",  708),
 ("m13", "agent", "pr",    "generatePR(changes) — every diff is embedded",      "msg.call",    752),
 ("m14", "pr",    "agent", "a diff adding a guard that is not in the branch",   "msg.failure",  796),
]

NOTES = [
 ("card_measured","card.failure",
  "<b>MEASURED — TWO FIXES IN, ONE FIX OUT</b><br>"
  "A fixture with two independent unguarded lookups in one file, and a plan with<br>"
  "one null-check step for each.<br>"
  "RAN — changes produced 2. Both read the SAME original: true. Step one's diff<br>"
  "adds the user guard, step two's adds the todo guard. applyChanges reported 2<br>"
  "applied. On disk afterwards: user guard present false, todo guard present true.<br>"
  "The first fix is gone. No error, no warning, nothing recording that it was<br>"
  "lost.<br>"
  "Which step survives is DETERMINISTIC, not arbitrary. The steps are sorted by<br>"
  "priority and the sort is stable, so equal priorities keep plan order and the<br>"
  "LAST step touching a file wins. Nothing signals that anywhere.", 96, 896, 880, 232),

 ("card_report","card.invariant",
  "<b>THE REPORT IS WRONG, NOT JUST THE FILE</b><br>"
  "applyChanges returns one entry per change, so the agent is told two files<br>"
  "were written. generatePR then loops every change and embeds each diff in a<br>"
  "fenced block — including the one that was reverted.<br>"
  "So a reviewer is shown a diff adding the user guard while the branch does not<br>"
  "contain it. Approving that diff approves something never applied.<br>"
  "This is what makes it worse than a plain lost update: the system does not<br>"
  "merely fail to apply a fix, it reports having applied it and produces the<br>"
  "evidence.<br>"
  "No concurrency is involved. A read phase separated from a write phase is<br>"
  "enough.", 1008, 896, 612, 232),
]
