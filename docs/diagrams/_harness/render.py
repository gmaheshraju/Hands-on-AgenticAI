#!/usr/bin/env /usr/bin/python3
"""Shared renderer v2 — ONE spec -> two artifacts. (v1 + three fixes, 2026-08-24)

FIX 1 — PRESENTATION ATTRIBUTES ON EVERY SHAPE.  v1 emitted colour ONLY as CSS
  custom properties. Measured: the SVG rendered as solid BLACK BOXES in
  rsvg-convert AND in Chrome when served via <img src> -- because <img>
  sandboxes the SVG and the page stylesheet never reaches inside. That is the
  recommended way to serve it, so v1 was website-breaking. Classes are still
  emitted, so a stylesheet in the SAME document still wins and the site's
  data-theme toggle keeps working. Cost measured at +21% bytes (12.0k -> 14.5k),
  still ~47x smaller than draw.io's own SVG export (685 KB, 94% of which is
  embedded PNG fallbacks it needs because its text is foreignObject).

FIX 2 — EDGE LABEL AT THE SEGMENT MIDPOINT.  v1 placed labels at
  pp[len(pp)//2], which for a 2-point path is the ENTRY PORT -- so the label
  landed on top of the target node and clipped ("finalRepo" ran off the page).

FIX 3 — DASH PARITY.  The stylesheet dashed edge.artifact / edge.analysis but
  the .drawio did not, so the two renderers disagreed by construction. The
  drawio emitter now dashes the same tokens the CSS does.


A diagram folder supplies spec.py with ZONES / NODES / EDGES / META and nothing
else. Everything that could drift if copy-pasted lives here, once.

Invariants enforced at BUILD time (the build fails; nobody reviews for these):
  - every authored coordinate divisible by GRID (grid quantum)
  - every vertex carries an authored semantic class -> <object class="...">
  - every edge carries pinned ports
  - every edge path is axis-aligned end to end (precondition for faithful SVG)
  - every colour resolves to a theme token; no hex may be typed in a spec
"""
import json, html, re, os

GRID = 4

class Spec:
    def __init__(self, mod, theme_path):
        self.zones = mod.ZONES
        self.nodes = mod.NODES
        self.edges = mod.EDGES
        self.meta  = mod.META
        self.theme = json.load(open(theme_path))
        self._by_id = {n[0]: n for n in self.nodes}
        self._validate()

    def hexes(self, tok):
        n = self.theme
        for k in tok.split('.'):
            if k not in n:
                raise KeyError(f"theme token '{tok}' not in {self.meta['theme']}")
            n = n[k]
        return n

    def port(self, nid, px, py):
        _, _, _, x, y, w, h = self._by_id[nid]
        return (x + px * w, y + py * h)

    def path(self, e):
        _, s, d, _, _, ex, en, pts = e
        return [self.port(s, *ex)] + list(pts) + [self.port(d, *en)]

    def _validate(self):
        for row in list(self.zones) + list(self.nodes):
            for v in row[3:7]:
                assert v % GRID == 0, f"{row[0]}: coord {v} not divisible by {GRID}"
        for e in self.edges:
            for (px, py) in e[7]:
                assert px % GRID == 0 and py % GRID == 0, f"{e[0]}: waypoint ({px},{py}) off-grid"
            pp = self.path(e)
            for (x1, y1), (x2, y2) in zip(pp, pp[1:]):
                assert abs(x1-x2) < .01 or abs(y1-y2) < .01, \
                    f"{e[0]}: segment ({x1},{y1})->({x2},{y2}) not axis-aligned"
            assert e[5] and e[6], f"{e[0]}: unpinned port"
            # Discovered twice (agent_harness_v1, system_design_v1): a fractional port on a
            # width/height that is not a multiple of 1/fraction lands OFF-grid, and then no
            # waypoint can ever align with it. Catch it at the port, not three errors later.
            #
            # NARROWED on first run: the first version asserted this for EVERY edge and
            # immediately failed an already-ACCEPTED diagram whose port sat at y=290 with no
            # waypoints -- where being off-grid costs nothing, because there is nothing to align
            # with. A rule that fails a good artifact is too broad. It applies only to edges that
            # actually carry waypoints.
            if not e[7]:
                continue
            for nid, (fx, fy) in ((e[1], e[5]), (e[2], e[6])):
                px, py = self.port(nid, fx, fy)
                assert abs(px - round(px/GRID)*GRID) < .01, \
                    f"{e[0]}: exit/entry x={px} on {nid} is off-grid (fraction {fx} of its width)"
                assert abs(py - round(py/GRID)*GRID) < .01, \
                    f"{e[0]}: exit/entry y={py} on {nid} is off-grid (fraction {fy} of its height)"
        for n in self.nodes:
            self.hexes(n[1])          # class must resolve in the theme
        for z in self.zones:
            self.hexes(z[2])

def _lines(label):
    return [(html.unescape(re.sub(r'</?b>', '', t)), '<b>' in t) for t in label.split('<br>')]

def _css(tok):
    return 'd-' + tok.replace('.', '-')

# L2 (legality) grammar. DIAGRAM_RULES_LLD.md requires terminal states to be
# "visually unmistakable" — a 3px border is how, and it is the one thing that
# makes a state diagram readable at a glance: you can see where the machine can
# stop. Doorways (sanctioned exceptions) are dashed because they ARE exceptional.
STROKE_W = {'state.terminal': 3, 'state.active': 2}
DASHED_EDGE = {'edge.artifact': '6 3', 'edge.analysis': '4 4', 'transition.doorway': '4 4'}

def _stroke_w(tok):
    return STROKE_W.get(tok, 1.5)

def emit_drawio(sp, out_path):
    o = ['<mxfile host="app.diagrams.net">',
         f'  <diagram id="{sp.meta["id"]}" name="{html.escape(sp.meta["name"])}">',
         f'    <mxGraphModel dx="1600" dy="900" grid="1" gridSize="{GRID}" guides="1" tooltips="1" '
         f'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{sp.meta["w"]}" '
         f'pageHeight="{sp.meta["h"]}" math="0" shadow="0">', '      <root>',
         '        <mxCell id="0" />', '        <mxCell id="1" parent="0" />']
    for zid, lbl, tok, x, y, w, h in sp.zones:
        c = sp.hexes(tok); sw = 1 if zid.endswith('_out') else 2
        o.append(f'        <mxCell id="{zid}" value="" style="rounded=1;fillColor=none;strokeColor={c};'
                 f'dashed=1;dashPattern=8 4;strokeWidth={sw};html=1;whiteSpace=wrap;fontSize=10;fontColor={c};" parent="1" vertex="1">')
        o.append(f'          <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry" />')
        o.append('        </mxCell>')
        o.append(f'        <mxCell id="{zid}_lbl" value="{html.escape(lbl)}" style="text;fontSize=10;'
                 f'fontStyle=1;fontColor={c};align=left;html=1;whiteSpace=wrap;" parent="1" vertex="1">')
        o.append(f'          <mxGeometry x="{x+12}" y="{y+8}" width="{w-16}" height="16" as="geometry" />')
        o.append('        </mxCell>')
    for nid, tok, lbl, x, y, w, h in sp.nodes:
        c = sp.hexes(tok); card = tok.startswith('card.')
        style = (f'rounded=1;fillColor={c["fill"]};strokeColor={c["stroke"]};strokeWidth={_stroke_w(tok)};'
                 f'fontSize={8 if card else 9};'
                 f'fontColor={sp.hexes("text.default")};html=1;whiteSpace=wrap;'
                 f'align={"left;spacingLeft=6" if card else "center"}{";opacity=70" if card else ""};')
        o += [f'        <object label="{html.escape(lbl)}" class="{tok}" id="{nid}">',
              f'          <mxCell style="{style}" parent="1" vertex="1">',
              f'            <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry" />',
              '          </mxCell>', '        </object>']
    for eid, s, d, lbl, tok, (ex, ey), (nx, ny), pts in sp.edges:
        c = sp.hexes(tok)
        dash = (';dashed=1;dashPattern=' + DASHED_EDGE[tok]) if tok in DASHED_EDGE else ''
        style = (f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor={c};fontColor={c};fontSize=8;'
                 f'exitX={ex};exitY={ey};exitDx=0;exitDy=0;entryX={nx};entryY={ny};entryDx=0;entryDy=0{dash};')
        o.append(f'        <mxCell id="{eid}" value="{html.escape(lbl)}" style="{style}" parent="1" '
                 f'source="{s}" target="{d}" edge="1">')
        if pts:
            arr = ''.join(f'<mxPoint x="{px}" y="{py}" />' for px, py in pts)
            o.append(f'          <mxGeometry relative="1" as="geometry"><Array as="points">{arr}</Array></mxGeometry>')
        else:
            o.append('          <mxGeometry relative="1" as="geometry" />')
        o.append('        </mxCell>')
    o += ['      </root>', '    </mxGraphModel>', '  </diagram>', '</mxfile>']
    open(out_path, 'w').write('\n'.join(o) + '\n')

def emit_svg(sp, out_path):
    m = sp.meta
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {m["w"]} {m["svg_h"]}" role="img" '
         f'aria-labelledby="{m["id"]}-t {m["id"]}-d" class="fts-diagram">',
         f'  <title id="{m["id"]}-t">{html.escape(m["name"])}</title>',
         f'  <desc id="{m["id"]}-d">{html.escape(m["desc"])}</desc>', '  <defs>']
    for tok in sorted(set(e[4] for e in sp.edges)):
        c = sp.hexes(tok)
        o.append(f'    <marker id="{m["id"]}-a-{_css(tok)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
                 f'markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{c}" '
                 f'class="{_css(tok)}-fill"/></marker>')
    o.append('  </defs>')
    for zid, lbl, tok, x, y, w, h in sp.zones:
        c = sp.hexes(tok); sw = 1 if zid.endswith('_out') else 2
        o += [f'  <g class="d-zone {_css(tok)}">',
              f'    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="none" stroke="{c}" '
              f'stroke-width="{sw}" stroke-dasharray="8 4"/>',
              f'    <text x="{x+12}" y="{y+20}" fill="{c}" font-size="12" font-weight="600" '
              f'class="d-zone-label">{html.escape(lbl)}</text>', '  </g>']
    for e in sp.edges:
        eid, _, _, lbl, tok, _, _, _ = e
        c = sp.hexes(tok)
        pp = sp.path(e); pts = ' '.join(f'{px},{py}' for px, py in pp)
        # FIX 2: midpoint of the LONGEST segment, not pp[len//2] (which is the
        # entry port on a 2-point path, putting the label on top of the target).
        segs = list(zip(pp, pp[1:]))
        (ax, ay), (bx, by) = max(segs, key=lambda s2: abs(s2[0][0]-s2[1][0]) + abs(s2[0][1]-s2[1][1]))
        mx, my = (ax + bx) / 2, (ay + by) / 2
        dash = (' stroke-dasharray="%s"' % DASHED_EDGE[tok]) if tok in DASHED_EDGE else ''
        wid = 2.25 if tok == 'edge.primary' else 1.75
        o += [f'  <g class="d-edge {_css(tok)}" data-edge="{eid}">',
              f'    <polyline points="{pts}" fill="none" stroke="{c}" stroke-width="{wid}"{dash} '
              f'marker-end="url(#{m["id"]}-a-{_css(tok)})"/>',
              f'    <text x="{mx}" y="{my-6}" text-anchor="middle" fill="{sp.hexes("text.muted")}" '
              f'font-size="10" class="d-edge-label">{html.escape(lbl)}</text>', '  </g>']
    for nid, tok, lbl, x, y, w, h in sp.nodes:
        ls = _lines(lbl); card = tok.startswith('card.')
        fs, lh = (11, 14) if card else (12, 15)
        c = sp.hexes(tok)
        mock_dash = ' stroke-dasharray="4 3"' if tok == 'component.mock' else ''
        o += [f'  <g class="d-node {_css(tok)}" data-id="{nid}" data-class="{tok}">',
              f'    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{c["fill"]}" '
              f'stroke="{c["stroke"]}" stroke-width="{_stroke_w(tok)}"{mock_dash}/>']
        ty = y + (h - len(ls)*lh)/2 + lh - 4
        for i, (txt, bold) in enumerate(ls):
            weight = ' font-weight="700"' if bold else ''
            anchor = 'start' if card else 'middle'
            bcls = ' d-bold' if bold else ''
            o.append(f'    <text x="{x+8 if card else x+w/2}" y="{ty+i*lh}" '
                     f'text-anchor="{anchor}" font-size="{fs}" '
                     f'fill="{sp.hexes("text.default")}"{weight} '
                     f'class="d-label{bcls}">{html.escape(txt)}</text>')
        o.append('  </g>')
    o.append('</svg>')
    open(out_path, 'w').write('\n'.join(o) + '\n')

CW = 0.55
def check_overflow(sp):
    bad = []
    for nid, tok, lbl, x, y, w, h in sp.nodes:
        card = tok.startswith('card.'); fs, lh = (11, 14) if card else (12, 15)
        pad = 16 if card else 12
        ls = _lines(lbl)
        for txt, _ in ls:
            if len(txt)*fs*CW > w - pad:
                bad.append((nid, 'H', txt[:40], round(len(txt)*fs*CW), w-pad))
        if len(ls)*lh > h - 4:
            bad.append((nid, 'V', '', len(ls)*lh, h-4))
    return bad
