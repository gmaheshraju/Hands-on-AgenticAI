#!/usr/bin/env /usr/bin/python3
"""L2b renderer — sequence diagrams. Altitude: TIME.

L1 asks where things live. L2 asks which transitions are legal. L2b asks what
happens in what ORDER, and that difference is not cosmetic: a defect can be
invisible at both other altitudes and obvious here. The diagram this module was
written for is the case in point -- two calls to the same object, each correct on
its own, whose ORDER undoes one of them. On an L1 map both are the same arrow.
In an L2 machine no state is reached illegally. Only the time view shows it.

WHY A SEPARATE EMITTER AND NOT MORE ZONES/NODES/EDGES. A lifeline is not a box
and a message is not an edge between boxes: an edge is pinned to ports on two
rectangles, while a message is pinned to a MOMENT on two vertical lines. Forcing
sequences through the L1 grammar would have meant fake nodes at every message
height -- inventing geometry to satisfy a primitive, which is how a harness
starts lying. The shared parts (theme resolution, escaping, grid quantum, label
measurement, the SVG/drawio scaffolding) are imported from render.py, so there
is still exactly one place that knows what a token is worth.

THE ONE INVARIANT THAT MATTERS: ORDER IS THE CONTENT. Messages are declared with
an explicit y and the build asserts they are STRICTLY INCREASING in declaration
order. A sequence diagram whose reading order differs from its declaration order
is not a diagram with a layout bug -- it is a false claim about what happened
first, which is the only claim it exists to make.

Spec shape (a folder supplies these instead of ZONES/NODES/EDGES):
  LIFELINES = [(id, token, label, cx)]              # header boxes, one row
  MESSAGES  = [(id, src, dst, label, token, y)]     # src == dst -> self-call
  FRAGMENTS = [(id, label, x, y, w, h)]             # loop / alt / opt boxes
  NOTES     = [(id, token, label, x, y, w, h)]      # cards, same shape as NODES
"""
import html, json
from render import GRID, _lines, _css, LBL_CHAR_W, LBL_LINE_H

LL_W, LL_H = 240, 60          # lifeline header box
SELF_W     = 88               # how far a self-call bulges to the right
MSG_MIN_DY = 28               # minimum vertical gap between consecutive messages
LL_MIN_DX  = LL_W + 40     # centres: header boxes must not touch

DASHED_MSG = {'msg.async': '5 4', 'msg.return': '4 4', 'msg.lifeline': '4 5'}

# Label separation is guaranteed HERE, not by a lint. A label box is LBL_LINE_H tall and
# sits just above its arrow, so any two consecutive labels clear each other as long as the
# minimum spacing exceeds that height. lint dropped its msg_label_overlap check on the
# strength of this assert -- if the constant is ever lowered, the build fails here rather
# than the guarantee quietly evaporating.
assert MSG_MIN_DY > LBL_LINE_H, \
    'MSG_MIN_DY (%s) must exceed the label height (%s) or labels can collide' % (MSG_MIN_DY, LBL_LINE_H)


class SeqSpec:
    def __init__(self, mod, theme_path):
        self.lifelines = list(mod.LIFELINES)
        self.messages  = list(mod.MESSAGES)
        self.fragments = list(getattr(mod, 'FRAGMENTS', []))
        self.notes     = list(getattr(mod, 'NOTES', []))
        self.meta      = mod.META
        self.theme     = json.load(open(theme_path))
        self._llx      = {l[0]: l[3] for l in self.lifelines}
        self._validate()

    # -- shared with the L1/L2 renderer -------------------------------------
    def hexes(self, tok):
        n = self.theme
        for k in tok.split('.'):
            if k not in n:
                raise KeyError("theme token '%s' not in %s" % (tok, self.meta['theme']))
            n = n[k]
        return n

    @property
    def top(self):    return self.meta['ll_top']
    @property
    def bottom(self): return self.meta['ll_bottom']
    @property
    def head_bottom(self): return self.top + LL_H

    # -- invariants, enforced at build time --------------------------------
    def _validate(self):
        assert self.lifelines, 'a sequence needs at least one lifeline'
        assert self.messages,  'a sequence needs at least one message'

        for row in self.lifelines:
            assert row[3] % GRID == 0, '%s: lifeline x %s off-grid' % (row[0], row[3])
        for row in list(self.fragments) + list(self.notes):
            for v in row[-4:]:
                assert v % GRID == 0, '%s: coord %s not divisible by %s' % (row[0], v, GRID)
        assert self.top % GRID == 0 and self.bottom % GRID == 0, 'lifeline span off-grid'

        seen = set()
        for lid, tok, _lbl, cx in self.lifelines:
            assert lid not in seen, 'duplicate lifeline id %s' % lid
            seen.add(lid)
            self.hexes(tok)
        xs = sorted(self._llx.values())
        for a, b in zip(xs, xs[1:]):
            assert b - a >= LL_MIN_DX, \
                'lifelines %s apart; %s is the minimum that keeps a message label readable' % (b - a, LL_MIN_DX)

        # ORDER IS THE CONTENT. Declaration order must equal reading order, or the
        # picture claims a sequence that never happened.
        prev = None
        for mid, s, d, _lbl, tok, y in self.messages:
            assert s in self._llx, '%s: unknown source lifeline %s' % (mid, s)
            assert d in self._llx, '%s: unknown target lifeline %s' % (mid, d)
            assert y % GRID == 0, '%s: y %s off-grid' % (mid, y)
            assert self.head_bottom < y < self.bottom, \
                '%s: y %s outside the lifeline span (%s..%s)' % (mid, y, self.head_bottom, self.bottom)
            if prev is not None:
                assert y > prev, '%s: y %s is not below the previous message (%s) -- ' \
                                 'declaration order must equal reading order' % (mid, y, prev)
                assert y - prev >= MSG_MIN_DY, \
                    '%s: only %s below the previous message; %s is the minimum' % (mid, y - prev, MSG_MIN_DY)
            prev = y
            self.hexes(tok)

        for fid, _lbl, x, y, w, h in self.fragments:
            inside = [m for m in self.messages if x <= self._llx[m[1]] <= x + w and y <= m[5] <= y + h]
            assert inside, '%s: fragment contains no message -- it is claiming a grouping that is not there' % fid
        for n in self.notes:
            self.hexes(n[1])

    # -- geometry ----------------------------------------------------------
    def msg_span(self, m):
        """(x_start, x_end) of the arrow, and whether it is a self-call."""
        _mid, s, d, _l, _t, _y = m
        if s == d:
            return self._llx[s], self._llx[s] + SELF_W, True
        return self._llx[s], self._llx[d], False


def _msg_label_pos(sp, m):
    x0, x1, selfcall = sp.msg_span(m)
    y = m[5]
    if selfcall:
        return x1 + 8, y - 4, 'start'
    return (x0 + x1) / 2.0, y - 7, 'middle'


def message_boxes(sp):
    """Label boxes for every message, for the lint's overlap check."""
    out = {}
    for m in sp.messages:
        mx, my, anchor = _msg_label_pos(sp, m)
        w = len(m[3]) * LBL_CHAR_W
        x0 = mx if anchor == 'start' else mx - w / 2
        out[m[0]] = (x0, my - LBL_LINE_H, x0 + w, my)
    return out


FRAG_TAB_H, FRAG_CHAR_W, FRAG_PAD = 18.0, 6.4, 14.0

def fragment_tab_boxes(sp):
    """Where each fragment's title bar is actually drawn, so lint can see it.

    The tab is a filled rect in the top-left corner of the fragment, clipped to the
    fragment width. It is opaque enough to print over a message label, which is what
    happened on ai_ux_seq_v1 -- a CLEAN build with two lines of text on top of each
    other. The renderer and the linter read this one function so they cannot disagree.
    """
    out = {}
    for fid, lbl, x, y, w, h in sp.fragments:
        out[fid] = (x, y, x + min(len(lbl) * FRAG_CHAR_W + FRAG_PAD, w), y + FRAG_TAB_H)
    return out


def emit_svg(sp, out_path):
    m = sp.meta
    txt, muted = sp.hexes('text.default'), sp.hexes('text.muted')
    o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s" role="img" '
         'aria-labelledby="%s-t %s-d" class="fts-diagram">' % (m['w'], m['svg_h'], m['id'], m['id']),
         '  <title id="%s-t">%s</title>' % (m['id'], html.escape(m['name'])),
         '  <desc id="%s-d">%s</desc>' % (m['id'], html.escape(m['desc'])), '  <defs>']
    for tok in sorted(set(x[4] for x in sp.messages)):
        c = sp.hexes(tok)
        o.append('    <marker id="%s-a-%s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
                 'markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="%s" '
                 'class="%s-fill"/></marker>' % (m['id'], _css(tok), c, _css(tok)))
    o.append('  </defs>')

    # fragments first, so messages draw over their border
    for fid, lbl, x, y, w, h in sp.fragments:
        c = sp.hexes('boundary.functional')
        o += ['  <g class="d-fragment" data-id="%s">' % fid,
              '    <rect x="%s" y="%s" width="%s" height="%s" rx="4" fill="none" stroke="%s" '
              'stroke-width="1.5" stroke-dasharray="8 4"/>' % (x, y, w, h, c),
              '    <rect x="%s" y="%s" width="%s" height="%d" rx="3" fill="%s" fill-opacity="0.12" '
              'stroke="%s" stroke-width="1"/>' % (x, y, min(len(lbl) * FRAG_CHAR_W + FRAG_PAD, w), FRAG_TAB_H, c, c),
              '    <text x="%s" y="%s" fill="%s" font-size="11" font-weight="600" '
              'class="d-frag-label">%s</text>' % (x + 7, y + 13, c, html.escape(lbl)), '  </g>']

    # lifelines: header box + the dashed line down the page
    for lid, tok, lbl, cx in sp.lifelines:
        c = sp.hexes(tok)
        x, y = cx - LL_W / 2, sp.top
        o += ['  <g class="d-lifeline %s" data-id="%s" data-class="%s">' % (_css(tok), lid, tok),
              '    <line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="1.5" '
              'stroke-dasharray="%s" class="d-lifeline-stem"/>'
              % (cx, sp.head_bottom, cx, sp.bottom, c['stroke'], DASHED_MSG['msg.lifeline']),
              '    <rect x="%s" y="%s" width="%s" height="%s" rx="6" fill="%s" stroke="%s" '
              'stroke-width="2"/>' % (x, y, LL_W, LL_H, c['fill'], c['stroke'])]
        ls = _lines(lbl); lh = 15
        ty = y + (LL_H - len(ls) * lh) / 2 + lh - 4
        for i, (t, bold) in enumerate(ls):
            o.append('    <text x="%s" y="%s" text-anchor="middle" font-size="12" fill="%s"%s '
                     'class="d-label%s">%s</text>'
                     % (cx, ty + i * lh, txt, ' font-weight="700"' if bold else '',
                        ' d-bold' if bold else '', html.escape(t)))
        o.append('  </g>')

    # messages, in declaration order == reading order
    for msg in sp.messages:
        mid, s, d, lbl, tok, y = msg
        c = sp.hexes(tok)
        x0, x1, selfcall = sp.msg_span(msg)
        dash = (' stroke-dasharray="%s"' % DASHED_MSG[tok]) if tok in DASHED_MSG else ''
        o.append('  <g class="d-msg %s" data-msg="%s">' % (_css(tok), mid))
        if selfcall:
            o.append('    <polyline points="%s,%s %s,%s %s,%s %s,%s" fill="none" stroke="%s" '
                     'stroke-width="1.75"%s marker-end="url(#%s-a-%s)"/>'
                     % (x0, y, x1, y, x1, y + 20, x0 + 4, y + 20, c, dash, m['id'], _css(tok)))
        else:
            o.append('    <line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="1.75"%s '
                     'marker-end="url(#%s-a-%s)"/>' % (x0, y, x1, y, c, dash, m['id'], _css(tok)))
        mx, my, anchor = _msg_label_pos(sp, msg)
        o += ['    <text x="%s" y="%s" text-anchor="%s" fill="%s" font-size="11" '
              'class="d-msg-label">%s</text>' % (mx, my, anchor, muted, html.escape(lbl)), '  </g>']

    # notes / cards -- same visual language as every other altitude
    for nid, tok, lbl, x, y, w, h in sp.notes:
        c = sp.hexes(tok); ls = _lines(lbl); fs, lh = 11, 14
        o += ['  <g class="d-node %s" data-id="%s" data-class="%s">' % (_css(tok), nid, tok),
              '    <rect x="%s" y="%s" width="%s" height="%s" rx="6" fill="%s" stroke="%s" '
              'stroke-width="1.5"/>' % (x, y, w, h, c['fill'], c['stroke'])]
        ty = y + (h - len(ls) * lh) / 2 + lh - 4
        for i, (t, bold) in enumerate(ls):
            o.append('    <text x="%s" y="%s" text-anchor="start" font-size="%s" fill="%s"%s '
                     'class="d-label%s">%s</text>'
                     % (x + 8, ty + i * lh, fs, txt, ' font-weight="700"' if bold else '',
                        ' d-bold' if bold else '', html.escape(t)))
        o.append('  </g>')

    o.append('</svg>')
    open(out_path, 'w').write('\n'.join(o) + '\n')


def emit_drawio(sp, out_path):
    m = sp.meta
    o = ['<mxfile host="app.diagrams.net">',
         '  <diagram id="%s" name="%s">' % (m['id'], html.escape(m['name'])),
         '    <mxGraphModel dx="1600" dy="900" grid="1" gridSize="%s" guides="1" tooltips="1" '
         'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="%s" pageHeight="%s" '
         'math="0" shadow="0">' % (GRID, m['w'], m['h']), '      <root>',
         '        <mxCell id="0" />', '        <mxCell id="1" parent="0" />']
    for fid, lbl, x, y, w, h in sp.fragments:
        c = sp.hexes('boundary.functional')
        o += ['        <mxCell id="%s" value="%s" style="shape=umlFrame;whiteSpace=wrap;html=1;'
              'fillColor=none;strokeColor=%s;dashed=1;fontSize=10;fontColor=%s;align=left;" '
              'parent="1" vertex="1">' % (fid, html.escape(lbl), c, c),
              '          <mxGeometry x="%s" y="%s" width="%s" height="%s" as="geometry" />' % (x, y, w, h),
              '        </mxCell>']
    for lid, tok, lbl, cx in sp.lifelines:
        c = sp.hexes(tok)
        o += ['        <object label="%s" class="%s" id="%s">' % (html.escape(lbl), tok, lid),
              '          <mxCell style="shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;'
              'html=1;container=0;rounded=1;fillColor=%s;strokeColor=%s;strokeWidth=2;fontSize=10;'
              'fontColor=%s;size=%s;" parent="1" vertex="1">'
              % (c['fill'], c['stroke'], sp.hexes('text.default'), LL_H),
              '            <mxGeometry x="%s" y="%s" width="%s" height="%s" as="geometry" />'
              % (cx - LL_W / 2, sp.top, LL_W, sp.bottom - sp.top),
              '          </mxCell>', '        </object>']
    for msg in sp.messages:
        mid, s, d, lbl, tok, y = msg
        c = sp.hexes(tok)
        x0, x1, selfcall = sp.msg_span(msg)
        dash = (';dashed=1;dashPattern=' + DASHED_MSG[tok]) if tok in DASHED_MSG else ''
        style = ('html=1;rounded=0;strokeColor=%s;fontColor=%s;fontSize=9;edgeStyle=orthogonalEdgeStyle;'
                 'endArrow=block%s;' % (c, c, dash))
        o += ['        <mxCell id="%s" value="%s" style="%s" parent="1" edge="1">'
              % (mid, html.escape(lbl), style),
              '          <mxGeometry relative="1" as="geometry">',
              '            <mxPoint x="%s" y="%s" as="sourcePoint" />' % (x0, y),
              '            <mxPoint x="%s" y="%s" as="targetPoint" />' % (x1, y + (20 if selfcall else 0)),
              '          </mxGeometry>', '        </mxCell>']
    for nid, tok, lbl, x, y, w, h in sp.notes:
        c = sp.hexes(tok)
        o += ['        <object label="%s" class="%s" id="%s">' % (html.escape(lbl), tok, nid),
              '          <mxCell style="rounded=1;fillColor=%s;strokeColor=%s;fontSize=8;fontColor=%s;'
              'html=1;whiteSpace=wrap;align=left;spacingLeft=6;opacity=70;" parent="1" vertex="1">'
              % (c['fill'], c['stroke'], sp.hexes('text.default')),
              '            <mxGeometry x="%s" y="%s" width="%s" height="%s" as="geometry" />' % (x, y, w, h),
              '          </mxCell>', '        </object>']
    o += ['      </root>', '    </mxGraphModel>', '  </diagram>', '</mxfile>']
    open(out_path, 'w').write('\n'.join(o) + '\n')


CW = 0.55
def _fits(bad, ident, lbl, w, h, fs, lh):
    for t, bold in _lines(lbl):
        need = len(t) * fs * CW * (1.06 if bold else 1.0)
        if need > w - 12:
            bad.append((ident, 'H', t[:44], round(need), w - 12))
    n = len(_lines(lbl))
    if n * lh > h - 8:
        bad.append((ident, 'V', '%d lines' % n, n * lh, h - 8))


def check_overflow(sp):
    """Every piece of authored text must fit the box drawn around it.

    Three surfaces, not one. The first version checked NOTES only, which is the
    surface inherited from L1 -- and left the two that are specific to this altitude
    unchecked. A lifeline header is a fixed 240px wide no matter how long the class
    name inside it is, and a fragment's title bar is clipped to the fragment width by
    the renderer, so an over-long `loop` label is silently truncated rather than
    overflowing visibly. Both are exactly the kind of defect that survives a green
    build and only a human eye catches, which is the thing this file exists to stop.
    """
    bad = []
    for nid, tok, lbl, x, y, w, h in sp.notes:
        _fits(bad, nid, lbl, w, h, 11, 14)
    for lid, tok, lbl, cx in sp.lifelines:
        _fits(bad, lid, lbl, LL_W, LL_H, 12, 15)
    for fid, lbl, x, y, w, h in sp.fragments:
        # The title bar is min(text+14, w) wide -- past that the renderer clips it, so
        # the label must fit the fragment it names.
        if len(lbl) * 6.4 + 14 > w:
            bad.append((fid, 'H', lbl[:44], round(len(lbl) * 6.4 + 14), w))
    return bad
