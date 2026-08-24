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

- **Edge labels** are now centred on the **longest segment** of the path. v1 put
  them at `pp[len//2]`, which on a 2-point edge is the entry port, so labels
  landed inside the target box. If you read older specs that add a pointless
  mid-lane waypoint purely to move a label, that hack is obsolete. Labels are
  still **not** overflow-checked — keep them 1–3 words.
- **Colour** is emitted as presentation attributes AND CSS classes. Never put a
  hex in a spec; the build rejects it.

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

## Cards carry the invariants

1–3 cards, each answering a question a reader would ask standing at that box
("what can stop this?", "how does it exit?"). The list is the REAL enumeration
from code, **complete and in code order, never "etc."** If it has 6 members,
show 6. A card is executable truth on a picture — that is the whole product.

## Done means

`build.py` prints **CLEAN**, `verify_facts.py` prints **BAD=0**, and you changed
nothing outside your own diagram folder.
