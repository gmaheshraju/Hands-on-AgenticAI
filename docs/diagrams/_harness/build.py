#!/usr/bin/env /usr/bin/python3
"""Build every governed diagram: spec -> .drawio + .svg -> lint -> LINT.md.

Usage:  /usr/bin/python3 _harness/build.py [dir ...]      (default: all *_v* dirs)
Exit 1 if any diagram has a lint failure.
"""
import sys, os, importlib.util, json, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import render, render_seq, lint

def load_spec(d):
    p = os.path.join(d, 'spec.py')
    s = importlib.util.spec_from_file_location('spec_' + os.path.basename(d), p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
    return m

def build(d):
    m = load_spec(d)
    theme = os.path.join(d, m.META['theme'])
    if not os.path.exists(theme): theme = os.path.join(HERE, m.META['theme'])
    # Altitude dispatch. A folder declares LIFELINES when it is answering the TIME
    # question, and ZONES/NODES/EDGES when it is answering the space or legality one.
    # Nothing else changes: same theme, same lint entry point, same LINT.md contract.
    if hasattr(m, 'LIFELINES'):
        sp = render_seq.SeqSpec(m, theme)
        render_seq.emit_drawio(sp, os.path.join(d, m.META['drawio']))
        render_seq.emit_svg(sp, os.path.join(d, m.META['svg']))
        res = lint.run_seq(sp, render_seq)
    else:
        sp = render.Spec(m, theme)
        render.emit_drawio(sp, os.path.join(d, m.META['drawio']))
        render.emit_svg(sp, os.path.join(d, m.META['svg']))
        res = lint.run(sp, render)
    n = sum(len(v) for v in res.values())
    rows = [f"| {k} | {'**' + str(len(v)) + '**' if v else '0'} |" for k, v in res.items()]
    detail = ''
    for k, v in res.items():
        for item in v: detail += f"- `{k}` {item}\n"
    # STAMP THE SOURCE. A committed report that cannot detect its own staleness is
    # a green light from a stale instrument -- edit spec.py, skip the rebuild, and
    # this file still claims CLEAN for a state that no longer exists. The hash makes
    # that detectable: `build.py --check` fails when a LINT.md no longer matches its spec.
    spec_sha = hashlib.sha256(open(os.path.join(d, 'spec.py'), 'rb').read()).hexdigest()
    open(os.path.join(d, 'LINT.md'), 'w').write(
        f"# Lint — {os.path.basename(d)}\n\n"
        f"Built by `_harness/build.py` from `spec.py` sha256 `{spec_sha[:16]}`.\n"
        f"If that hash does not match the current spec, THIS REPORT IS STALE and its "
        f"verdict must not be trusted — run `build.py --check` to detect it.\n\n"
        f"Enforced by construction (cannot fail here): grid quantum, pinned ports, "
        f"axis-aligned paths, theme-token-only colour, text attributes.\n\n"
        f"| Emergent check | Violations |\n|---|---|\n" + '\n'.join(rows) + "\n\n" +
        (detail and f"## Detail\n{detail}\n" or "") +
        f"\nHuman render gate is NOT covered by any of the above "
        f"(`DIAGRAM_RULES.md:108-111`). Legibility remains Mahesh's.\n")
    return os.path.basename(d), sp, n, res

def check_stale(dirs):
    """Fail if any committed LINT.md no longer matches its spec.py."""
    stale = []
    for d in dirs:
        lp = os.path.join(d, 'LINT.md')
        if not os.path.exists(lp):
            stale.append((os.path.basename(d), 'NO LINT.md')); continue
        want = hashlib.sha256(open(os.path.join(d, 'spec.py'), 'rb').read()).hexdigest()[:16]
        txt = open(lp).read()
        if want not in txt:
            stale.append((os.path.basename(d), 'spec changed since last build'))
    return stale

if __name__ == '__main__':
    if '--check' in sys.argv:
        sys.argv.remove('--check')
        dirs = sys.argv[1:] or sorted(
            os.path.join(ROOT, x) for x in os.listdir(ROOT)
            if '_v' in x and os.path.isdir(os.path.join(ROOT, x))
            and os.path.exists(os.path.join(ROOT, x, 'spec.py')))
        st = check_stale(dirs)
        print(f"stale-report check: {len(dirs)} diagram(s), {len(st)} stale")
        for s_ in st: print(f"  STALE  {s_[0]}: {s_[1]}")
        sys.exit(1 if st else 0)
    dirs = sys.argv[1:] or sorted(
        os.path.join(ROOT, x) for x in os.listdir(ROOT)
        if '_v' in x and os.path.isdir(os.path.join(ROOT, x)) and os.path.exists(os.path.join(ROOT, x, 'spec.py')))
    fails = 0
    for d in dirs:
        name, sp, n, res = build(d)
        flag = 'CLEAN' if n == 0 else f'{n} VIOLATION(S)'
        if hasattr(sp, 'lifelines'):
            shape = f"lifelines={len(sp.lifelines):3d} msgs={len(sp.messages):3d} frags={len(sp.fragments):2d}"
        else:
            shape = f"nodes={len(sp.nodes):3d} edges={len(sp.edges):3d} zones={len(sp.zones):2d}"
        print(f"{name:34s} {shape}  {flag}")
        if n:
            fails += 1
            for k, v in res.items():
                for it in v: print(f"     {k}: {it}")
    print(f"\n{len(dirs)} diagram(s), {fails} with violations")
    sys.exit(1 if fails else 0)
