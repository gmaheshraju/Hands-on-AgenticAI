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


# ---------------------------------------------------------------- L2b (time)
def msg_label_offpage(sp, render_seq):
    """A message label must not run off the canvas.

    THIS CHECK REPLACED msg_label_overlap, WHICH WAS DEAD CODE. That one asked whether
    two message labels could collide; they cannot. MSG_MIN_DY forces consecutive
    messages 28px apart while a label box is 12px tall, so the worst-case pairing still
    leaves a 13px gap -- overlap is unreachable by construction, and a check that can
    never fire is a second gate doing a job the first gate already does. render_seq
    asserts the constant that makes that true, so deleting the check does not quietly
    lose the guarantee.

    What IS emergent: a long label centred between two close lifelines can extend past
    x=0 or past the canvas width, which no constant prevents because it depends on how
    many characters the author wrote. That is the real failure mode here, and it is
    silent -- the SVG simply clips.
    """
    bad = []
    for mid, (x0, _y0, x1, _y1) in sorted(render_seq.message_boxes(sp).items()):
        if x0 < 0:
            bad.append((mid, 'runs off the LEFT edge by', round(-x0)))
        if x1 > sp.meta['w']:
            bad.append((mid, 'runs off the RIGHT edge by', round(x1 - sp.meta['w'])))
    return bad


def msg_crosses_note(sp):
    """A message arrow must not run through a note box.

    Notes are placed by hand in the margins; a message that crosses one is the
    sequence equivalent of edge_through_node, and just as unreadable.
    """
    bad = []
    for m in sp.messages:
        x0, x1, _self = sp.msg_span(m)
        y = m[5]
        for nid, _tok, _lbl, nx, ny, nw, nh in sp.notes:
            if max(x0, x1) > nx and min(x0, x1) < nx + nw and ny < y < ny + nh:
                bad.append((m[0], nid))
    return bad


def note_overlaps_lifeline(sp):
    """A note must not sit on a lifeline stem -- it hides the thing it annotates."""
    bad = []
    for nid, _tok, _lbl, nx, ny, nw, nh in sp.notes:
        for lid, _t, _l, cx in sp.lifelines:
            if nx < cx < nx + nw and ny < sp.bottom and ny + nh > sp.top:
                bad.append((nid, lid))
    return bad


def msg_label_over_fragment_tab(sp, render_seq):
    """A message label must not be printed under a fragment's title bar.

    Found by LOOKING at ai_ux_seq_v1: the parked-window tab and the hitl_request label
    rendered on top of each other, two lines of text in the same place, on a build that
    reported CLEAN. Every other overlap check compared messages to messages or messages
    to notes; nothing compared a message to the one opaque box a fragment draws.
    """
    tabs = render_seq.fragment_tab_boxes(sp)
    labels = render_seq.message_boxes(sp)
    bad = []
    for mid, a in sorted(labels.items()):
        for fid, b in sorted(tabs.items()):
            ox = min(a[2], b[2]) - max(a[0], b[0])
            oy = min(a[3], b[3]) - max(a[1], b[1])
            if ox > 0 and oy > 0:
                bad.append((mid, fid, round(ox), round(oy)))
    return bad


def lifeline_offpage(sp, render_seq):
    """A lifeline header must fit inside the canvas.

    Found by LOOKING: ai_ux_seq_v1 put its rightmost lifeline at x=1600 on a 1700-wide
    canvas, so a 240px header ran 20px off the edge and the box was drawn with no right
    side. Nothing checked it -- overflow measured TEXT against its box, never the box
    against the page.
    """
    half = render_seq.LL_W / 2.0
    bad = []
    for lid, _tok, _lbl, cx in sp.lifelines:
        if cx - half < 0:
            bad.append((lid, 'header runs off the LEFT edge by', round(half - cx)))
        if cx + half > sp.meta['w']:
            bad.append((lid, 'header runs off the RIGHT edge by', round(cx + half - sp.meta['w'])))
    return bad


def run_seq(sp, render_seq):
    return {
        'msg_label_offpage':  msg_label_offpage(sp, render_seq),
        'msg_over_frag_tab':  msg_label_over_fragment_tab(sp, render_seq),
        'lifeline_offpage':   lifeline_offpage(sp, render_seq),
        'msg_crosses_note':   msg_crosses_note(sp),
        'note_on_lifeline':   note_overlaps_lifeline(sp),
        'overflow':           render_seq.check_overflow(sp),
    }
