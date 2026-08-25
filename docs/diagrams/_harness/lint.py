"""Geometric checks that CANNOT be enforced by construction.

Four checks live here. Everything else the FTS checklist covers is now
impossible to violate, because a spec can only express legal values:
  off-theme hex      -> specs name tokens, never hex
  unpinned ports     -> asserted in Spec._validate
  grid quantum       -> asserted in Spec._validate
  diagonal segments  -> asserted in Spec._validate
  text attrs         -> emitted by the renderer, not authored
By-construction beats checking. What remains is genuinely emergent from layout.
"""
from itertools import combinations

LANE_MIN = 20   # DIAGRAM_RULES body + L2 (the checklist's 15 is the stale value)
CLEAR_MIN = 15  # boundary-parallel clearance

def _segs(sp):
    out = []
    for e in sp.edges:
        pp = sp.path(e)
        for a, b in zip(pp, pp[1:]):
            out.append((e[0], a, b))
    return out

def collinear(sp):
    bad = []
    for (i1, a1, b1), (i2, a2, b2) in combinations(_segs(sp), 2):
        if i1 == i2: continue
        h1, h2 = abs(a1[1]-b1[1]) < .01, abs(a2[1]-b2[1]) < .01
        v1, v2 = abs(a1[0]-b1[0]) < .01, abs(a2[0]-b2[0]) < .01
        if h1 and h2:
            ov = min(max(a1[0],b1[0]), max(a2[0],b2[0])) - max(min(a1[0],b1[0]), min(a2[0],b2[0]))
            d = abs(a1[1]-a2[1])
            if ov > 0 and d < LANE_MIN: bad.append((i1, i2, 'H', round(d), round(ov)))
        elif v1 and v2:
            ov = min(max(a1[1],b1[1]), max(a2[1],b2[1])) - max(min(a1[1],b1[1]), min(a2[1],b2[1]))
            d = abs(a1[0]-a2[0])
            if ov > 0 and d < LANE_MIN: bad.append((i1, i2, 'V', round(d), round(ov)))
    return bad

def edge_through_node(sp):
    bad = []
    for e in sp.edges:
        pp = sp.path(e); ends = {e[1], e[2]}
        for a, b in zip(pp, pp[1:]):
            for nid, tok, _, x, y, w, h in sp.nodes:
                if nid in ends: continue
                x0, x1 = min(a[0],b[0]), max(a[0],b[0])
                y0, y1 = min(a[1],b[1]), max(a[1],b[1])
                if x1 > x and x0 < x+w and y1 > y and y0 < y+h:
                    bad.append((e[0], nid))
    return bad

def zone_gutters(sp):
    bad = []
    for (za, _, _, ax, ay, aw, ah), (zb, _, _, bx, by, bw, bh) in combinations(sp.zones, 2):
        nested = (ax <= bx and ay <= by and ax+aw >= bx+bw and ay+ah >= by+bh) or \
                 (bx <= ax and by <= ay and bx+bw >= ax+aw and by+bh >= ay+ah)
        if nested: continue           # nesting is MANDATED for the functional boundary
        gx = max(bx-(ax+aw), ax-(bx+bw))
        gy = max(by-(ay+ah), ay-(by+bh))
        gap = max(gx, gy)
        if gap < 60: bad.append((za, zb, round(gap)))
    return bad

def node_straddles_zone(sp):
    """A node must be fully INSIDE a zone or fully OUTSIDE it -- never crossing its border.

    Found by LOOKING at a render, not by any geometric check: agent_memory_v1's
    addFact card sat half in / half out of the green functional boundary, with the
    dashed line running through its middle, and the build was fully green. A card
    straddling a boundary is ambiguous -- is it part of that flow or not? -- and
    ambiguity is the one thing a governed diagram may not ship.
    """
    bad = []
    for nid, tok, _, nx, ny, nw, nh in sp.nodes:
        for zid, _, _, zx, zy, zw, zh in sp.zones:
            inside_x = nx >= zx and nx + nw <= zx + zw
            inside_y = ny >= zy and ny + nh <= zy + zh
            overlaps = (nx < zx + zw and nx + nw > zx and ny < zy + zh and ny + nh > zy)
            if overlaps and not (inside_x and inside_y):
                bad.append((nid, zid))
    return bad


def edge_label_overlap(sp, render):
    """Two edge labels must not sit on top of each other.

    Found by LOOKING at a render, not by any existing check: two parallel vertical
    edges 48px apart both had their labels placed at the midpoint of their only
    segment, so both landed at the same y and the text overlapped into an unreadable
    smear. The build was CLEAN -- the geometry was legal, the PICTURE was not. The
    same check then found the same defect on two diagrams already live on the site.

    The renderer now dodges labels into the first free slot along their own segment,
    so most collisions never reach here. This is the backstop for the ones the dodge
    cannot solve, and it reads the positions from render.label_boxes() so the linter
    can never disagree with what was actually drawn.
    """
    boxes = [(eid, b) for eid, (_, _, b) in render.label_boxes(sp).items()]
    bad = []
    for (i1, a), (i2, b) in combinations(sorted(boxes), 2):
        ox = min(a[2], b[2]) - max(a[0], b[0])
        oy = min(a[3], b[3]) - max(a[1], b[1])
        if ox > 0 and oy > 0:
            bad.append((i1, i2, round(ox), round(oy)))
    return bad

def run(sp, render):
    return {
        'collinear':   collinear(sp),
        'through_node': edge_through_node(sp),
        'gutters':     zone_gutters(sp),
        'straddle':    node_straddles_zone(sp),
        'label_overlap': edge_label_overlap(sp, render),
        'overflow':    render.check_overflow(sp),
    }
