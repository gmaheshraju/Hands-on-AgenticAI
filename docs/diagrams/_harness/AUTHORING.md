# Authoring a `spec.py` — the layout playbook

Written from 4 build cycles on `agent_memory_v1` and 3 on `system_design_v1`.
Every rule below is here because it FAILED first. Read it before laying out, not
after — the build will catch you, but each cycle costs a round trip.

## The contract

A diagram folder contains exactly: `spec.py`, `FACTS.md`, `<theme>.json`.
Everything else is generated. `spec.py` holds **content only** — four names:

```python
META  = {...}                                   # id, name, desc, theme, drawio, svg, w, h, svg_h
ZONES = [(id, label, boundary_token, x, y, w, h), ...]
NODES = [(id, semantic_token, label, x, y, w, h), ...]
EDGES = [(id, src, dst, label, edge_token, (exitX,exitY), (entryX,entryY), [waypoints]), ...]
```

Build and lint: `/usr/bin/python3 _harness/build.py <dir>` — **iterate until it
prints CLEAN.** The build is the judge; do not hand back a spec that has not
printed CLEAN.

## Tokens (never write a hex value — the build rejects it)

`component.entry` `component.service` `component.agent` `component.external`
`component.mock` `component.artifact` · `card.invariant` `card.failure`
`card.primitive` · `boundary.primary` `boundary.functional` `boundary.external`
`boundary.datasource` `boundary.observability` · `edge.primary` `edge.call`
`edge.data_in` `edge.artifact` `edge.stop` `edge.analysis`

## The five rules that will bite you

**1. GRID — every authored coordinate divisible by 4.** Including waypoints.

**2. PORTS MUST LAND ON THE GRID when an edge has waypoints.** A `0.75` port on
a 152-wide node sits at x+114 — off-grid, and then no waypoint can ever align
with it. **Use width 160 or 176 and height 64** for any node you attach a
0.25/0.75 port to. (160·0.25=40 ✓, 176·0.25=44 ✓, 64·0.25=16 ✓.)

**3. EVERY SEGMENT AXIS-ALIGNED, end to end.** The path is
`exit-port → waypoints → entry-port`. Consecutive points must share x or y.
Work it out on paper: if the exit is at y=412 and your first waypoint is at
y=360, you need `(x_exit,412)` first. This is the single most common failure.

**4. NOTHING CROSSES A NODE IT IS NOT ATTACHED TO.** Cards are nodes. Before
running a vertical down a column, check what is in that column. The usual
mistake is dropping an edge from a top-row node straight through the card
sitting below it.

**5. TEXT MUST FIT.** Budget, at 0.55 em average glyph width:
  - node (12px): `max_chars ≈ (w − 12) / 6.6` → **w=176 gives ~24 chars/line**
  - card (11px): `max_chars ≈ (w − 16) / 6.05` → **w=456 gives ~72 chars/line**
  Count your longest line BEFORE building. Prefer `:157` over `memory.js:157`
  inside a node whose title already names the file.

**6. A NODE MUST NOT STRADDLE A ZONE BORDER.** Wholly inside or wholly outside —
never crossing. A card half in / half out of a functional boundary is ambiguous
(is it part of that flow?) and ambiguity is the one thing a governed diagram may
not ship. `lint.py` now checks this. Found by LOOKING at a render while the build
was fully green.

**7. A RISER LEAVING A NODE INSIDE A FUNCTIONAL BOUNDARY WILL STRIKE THROUGH THAT
BOUNDARY'S LABEL.** The label is renderer-placed at `(zone.x+12, zone.y+20)`, is
not wrapped or clipped, and is **not linted**. If you must run an edge up past the
top of a functional zone, exit the node LEFT and run the riser outside the zone.
(Reported by the 04-multi-agent build.)

## Fixed in the renderer — do NOT work around these any more

- **Edge labels** are centred on the **longest segment** of the path, and if that
  position collides with a label already placed they **dodge** to the first free
  slot along the same segment (`render.label_boxes`). v1 put them at
  `pp[len//2]`, which on a 2-point edge is the entry port, so labels landed
  inside the target box; v2 put two labels on the same spot whenever a
  horizontal and a vertical edge crossed near their middles. If you read older
  specs that add a pointless mid-lane waypoint purely to move a label, that hack
  is obsolete. Labels are still **not** overflow-checked — keep them short.
- **Colour** is emitted as presentation attributes AND CSS classes. Never put a
  hex in a spec; the build rejects it.

## Two things the diagram may NOT say

- **No line numbers in labels.** `verify_facts.py --specs` fails the build if a
  label contains `:` followed by a digit. Line numbers are the most brittle
  anchor there is, and until 2026-08-24 the ones baked into labels were the only
  citations nothing checked — visible rigour that was unverified, while the
  verified rigour was invisible. Name the **method** instead; it survives edits.
  Every line number belongs in `FACTS.md`, where it is machine-checked.
- **No bare filenames in FACTS.md citations that two projects share.**
  Resolution is scoped to the diagram's own project via the map in
  `emit_manifest.py`, so `executor.js:211` means *this* project's. If the
  diagram is not in that map the check falls back to searching every project
  and reports **AMBIGUOUS** rather than picking one — which it used to do
  silently, validating line numbers against a different project's file.

## Run the harness with the RIGHT interpreter

Always `/usr/bin/python3` (3.9.6). Homebrew's Pythons cannot parse XML here
(`ImportError: No module named expat`), and 3.9 forbids backslashes inside
f-string expressions where 3.14 allows them — so a syntax check run under the
wrong interpreter passes code that the harness cannot execute.

## The layout that works (start here, adapt)

Page 1700×1000, content within ~1656×780.

```
z_entry   40, 200, 240, 292      ③ entry points          (2 nodes at x=64, w=160, h=64)
z_proc   344,  96, 936, 680      ① the process
  z_flow 376, 196, 872, 280        functional boundary (ONE only, inside ①)
z_ext   1344, 200, 296, 336      ② external / network boundary
z_out   1344, 600, 296, 180      ④ artifacts written
```

Gutters are **64px** by construction: 280→344 and 1280→1344. Two lanes fit in
each: **x=1296 and x=1320** (24px apart, ≥16px from both borders). Plan which
edges use which lane before you write them.

Rows inside `z_flow`: `y=252, h=64` for the main flow (3 nodes at x=408, 688,
968 — w=176). Second row `y=400`. Below the flow boundary: mocks at `y≈460-500`,
cards from `y≈540`.

**Reserve a card column.** Put cards where no vertical runs — commonly
`x=904..1248` — and route long verticals at `x≈864-888` (between the last node
and the card column) or `x≥1056` (right of it).

## Altitude discipline

L1 is **space**: where things live, what talks to what, what crosses a boundary.
6–12 component boxes. An internal loop or state machine is L2/L2b — exclude it
and say so in FACTS.md. More than ~12 boxes means you are drawing a call graph.

L2 is **legality**: which transitions exist, what enforces them, where the
machine can stop. Four state classes (`state.initial|active|transitional|
terminal`) and four transition classes (`transition.normal|failure|revert|
doorway`) — and no decision pseudo-state, so a branch point is a **guard card**
with its complete enumeration in code order, never a box. Terminal states get a
3px border from the token; that is what makes "where can this stop?" answerable
at a glance, so never spend it on a non-terminal state.

**Earn the L2 before drawing it.** Statuses on a record are not a state machine.
The test is whether a status is ever *reassigned* under a rule: `18-workflow-
engine` has a `VALID_TRANSITIONS` table that throws, `23` and `25` have real
reassignment with guards. `14-forward-deployed-engineering` was rejected — its
`dashboard.js` writes `issue.status = req.body.status` with no enum and no
guard, and its `evalBuilder.js` labels are assigned once into different arrays.
That is classification, not a lifecycle, and drawing one would be manufacturing
content. Three of 31 projects earned an L2; the honest answer was 3, not 4.

## Cards carry the invariants

1–3 cards, each answering a question a reader would ask standing at that box
("what can stop this?", "how does it exit?"). The list is the REAL enumeration
from code, **complete and in code order, never "etc."** If it has 6 members,
show 6. A card is executable truth on a picture — that is the whole product.

## Done means

`npm run verify:diagrams` passes — that is `build.py --check` (every diagram
CLEAN and no LINT.md stale against its spec hash), `verify_facts.py --specs`
(no line numbers in labels) and `verify_facts.py --all projects` (every citation
resolves, scoped to its own project).

Then **look at the render**. `rsvg-convert -w 1700 <dir>/*.svg -o /tmp/x.png`
and open it. Every lint check in `lint.py` exists because someone looked at a
picture that had passed a green build — the straddling card, the smeared pair of
edge labels. A CLEAN build means the geometry is legal, not that the picture is
readable. Mahesh's eye is the acceptance test; run it on yourself first.
