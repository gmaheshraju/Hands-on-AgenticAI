#!/usr/bin/env /usr/bin/python3
"""Render .drawio via draw.io's OWN engine — the ground-truth picture.

Why this exists, given we already emit SVG ourselves:

1. VERIFICATION. DIAGRAM_RULES.md:108-111 says "AI cannot see its own visual
   output". With a PNG on disk that is no longer true for the MECHANICAL half.
   Dead space, floating edge labels, cards reading as disconnected -- none of
   these are lint violations, and all three were found by looking at the first
   export. This does NOT replace Mahesh's gate; it adds a tier below it.
2. FIDELITY. _harness/render.py's SVG emitter is a REIMPLEMENTATION of draw.io's
   rendering. It is faithful because every path is axis-aligned (asserted), but
   that is an argument. Rendering both and comparing is evidence.

NOT for the web. Measured on agent_harness_v1 [RAN 2026-08-24]:
    draw.io PNG @2x  485 KB      draw.io SVG  685 KB      our SVG  11.6 KB
draw.io's SVG embeds fonts and per-glyph markup (59x ours) and bakes in hex, so
it cannot theme with the site's data-theme toggle. Our emitter stays the web
artifact; this one is the proof.

Note: the CLI briefly flashes an Electron window on macOS even in export mode.
In CI wrap with xvfb-run.
"""
import subprocess, sys, os, glob

DRAWIO = '/Applications/draw.io.app/Contents/MacOS/draw.io'

def export(drawio_path, out_path, fmt='png', scale=2):
    if not os.path.exists(DRAWIO):
        raise SystemExit(f"draw.io CLI not found at {DRAWIO} — brew install --cask drawio")
    cmd = [DRAWIO, '-x', '-f', fmt, '-o', out_path, drawio_path]
    if fmt == 'png':
        cmd[2:2] = ['-s', str(scale)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not os.path.exists(out_path):
        raise SystemExit(f"export produced nothing: {r.stdout}\n{r.stderr}")
    return os.path.getsize(out_path)

def png_size(p):
    import struct
    with open(p, 'rb') as f:
        return struct.unpack('>II', f.read(24)[16:24])

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dirs = sys.argv[1:] or sorted(
        d for d in glob.glob(os.path.join(root, '*_v*')) if os.path.isdir(d))
    for d in dirs:
        src = glob.glob(os.path.join(d, '*.drawio'))
        if not src:
            print(f"{os.path.basename(d):30s} no .drawio"); continue
        out = os.path.join(d, '_render.png')
        n = export(src[0], out)
        w, h = png_size(out)
        print(f"{os.path.basename(d):30s} {w}x{h}  {n//1024} KB  -> {os.path.relpath(out, root)}")
