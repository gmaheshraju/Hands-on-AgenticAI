#!/usr/bin/env /usr/bin/python3
"""Build every governed diagram: spec -> .drawio + .svg -> lint -> LINT.md.

Usage:  /usr/bin/python3 _harness/build.py [dir ...]      (default: all *_v* dirs)
Exit 1 if any diagram has a lint failure.
"""
import sys, os, importlib.util, json
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import render, lint

def load_spec(d):
    p = os.path.join(d, 'spec.py')
    s = importlib.util.spec_from_file_location('spec_' + os.path.basename(d), p)
    m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
    return m

def build(d):
    m = load_spec(d)
    theme = os.path.join(d, m.META['theme'])
    if not os.path.exists(theme): theme = os.path.join(HERE, m.META['theme'])
    sp = render.Spec(m, theme)
    render.emit_drawio(sp, os.path.join(d, m.META['drawio']))
    render.emit_svg(sp, os.path.join(d, m.META['svg']))
    res = lint.run(sp, render)
    n = sum(len(v) for v in res.values())
    rows = [f"| {k} | {'**' + str(len(v)) + '**' if v else '0'} |" for k, v in res.items()]
    detail = ''
    for k, v in res.items():
        for item in v: detail += f"- `{k}` {item}\n"
    open(os.path.join(d, 'LINT.md'), 'w').write(
        f"# Lint — {os.path.basename(d)}\n\n"
        f"Built by `_harness/build.py`. Enforced by construction (cannot fail here): grid quantum, "
        f"pinned ports, axis-aligned paths, theme-token-only colour, text attributes.\n\n"
        f"| Emergent check | Violations |\n|---|---|\n" + '\n'.join(rows) + "\n\n" +
        (detail and f"## Detail\n{detail}\n" or "") +
        f"\nHuman render gate is NOT covered by any of the above "
        f"(`DIAGRAM_RULES.md:108-111`). Legibility remains Mahesh's.\n")
    return os.path.basename(d), sp, n, res

if __name__ == '__main__':
    dirs = sys.argv[1:] or sorted(
        os.path.join(ROOT, x) for x in os.listdir(ROOT)
        if '_v' in x and os.path.isdir(os.path.join(ROOT, x)) and os.path.exists(os.path.join(ROOT, x, 'spec.py')))
    fails = 0
    for d in dirs:
        name, sp, n, res = build(d)
        flag = 'CLEAN' if n == 0 else f'{n} VIOLATION(S)'
        print(f"{name:34s} nodes={len(sp.nodes):3d} edges={len(sp.edges):3d} zones={len(sp.zones):2d}  {flag}")
        if n:
            fails += 1
            for k, v in res.items():
                for it in v: print(f"     {k}: {it}")
    print(f"\n{len(dirs)} diagram(s), {fails} with violations")
    sys.exit(1 if fails else 0)
