#!/usr/bin/env /usr/bin/python3
"""Every file:line citation in a FACTS.md must resolve to a non-blank line.

Hand-written citations drift immediately: writing ONE facts file by hand on
2026-08-23 produced 3 wrong line numbers out of 49 (6%) despite care. This is
why citations are machine-checked, not reviewed.

Usage: verify_facts.py <FACTS.md> <source-root>
Exit 1 on any unresolved citation.
"""
import re, sys, os

def main(facts_path, src_root, scope=None):
    # SCOPE REMOVES THE AMBIGUITY BY CONSTRUCTION. Every FACTS.md belongs to exactly
    # one project, so searching all 31 for a basename was never right -- it is what let
    # `engine.js:168` match two different projects. The diagram->project map that the
    # manifest already maintains is the same fact, so resolution reuses it. Unscoped
    # calls still work and still report AMBIGUOUS rather than guessing.
    if scope:
        scoped = os.path.join(src_root, scope)
        if os.path.isdir(scoped): src_root = scoped
    s = open(facts_path).read()
    cites = sorted(set(re.findall(r'\b([\w./-]+\.(?:js|mjs|jsx|ts|py)):(\d+)', s)),
                   key=lambda x: (x[0], int(x[1])))
    bad, ok = [], 0
    for f, ln in cites:
        # Resolution must be RECURSIVE. The first version tried only <root>/<f> and
        # <root>/src/<basename>, and reported 14 false FILE-NOT-FOUNDs on 04-multi-agent-systems
        # whose modules live in src/agents/. A verifier that cannot find a file it was given
        # manufactures failures, which is worse than missing real ones -- people stop reading it.
        cand = [os.path.join(src_root, f), os.path.join(src_root, 'src', os.path.basename(f))]
        p = next((c for c in cand if os.path.exists(c)), None)
        if not p:
            # AMBIGUITY IS AN ERROR, NOT A COIN FLIP. The first version took the first
            # basename match found while walking. In a 31-project monorepo two projects
            # both have src/executor.js, so `executor.js:211` silently resolved to the
            # WRONG project's file -- and either reported a false OUT OF RANGE or, worse,
            # validated the line against source the diagram is not about. A verifier that
            # answers confidently from the wrong file is a green light from a stale
            # instrument. Now: exactly one match resolves, more than one is a failure that
            # names the candidates, and the citation must be qualified until it is unique.
            base = os.path.basename(f)
            hits = []
            for dirpath, _, names in os.walk(src_root):
                if 'node_modules' in dirpath: continue
                if base in names: hits.append(os.path.join(dirpath, base))
            if len(hits) > 1:
                rel = sorted(os.path.relpath(h, src_root) for h in hits)
                bad.append((f, ln, 'AMBIGUOUS -- %d files match, qualify the path: %s'
                            % (len(hits), ', '.join(rel[:4])))); continue
            if hits: p = hits[0]
        if not p:
            bad.append((f, ln, 'FILE NOT FOUND')); continue
        lines = open(p).read().split('\n')
        n = int(ln)
        if n > len(lines): bad.append((f, ln, f'OUT OF RANGE (file has {len(lines)})'))
        elif not lines[n-1].strip(): bad.append((f, ln, 'BLANK LINE'))
        else: ok += 1
    print(f"{os.path.basename(os.path.dirname(facts_path)):32s} citations n={len(cites)}  resolved={ok}  BAD={len(bad)}")
    for b in bad: print(f"     {b[0]}:{b[1]} — {b[2]}")
    return 1 if bad else 0

def check_spec_labels(spec_path):
    """A diagram LABEL must not carry a line number.

    Line numbers are the most brittle anchor there is -- one added import above a
    cited line and every :NNN below it is wrong. Worse, until 2026-08-24 the 1,787
    line numbers baked into diagram labels were the ONLY citations nothing checked:
    verify_facts.py reads FACTS.md, build.py reads geometry, and neither looked at a
    label. The visible rigour was unverified while the verified rigour was invisible.

    So the rule is: the DIAGRAM says where (filename), FACTS.md says exactly where
    (file:line) and is machine-checked. If a line number ever reappears in a label,
    it is unverifiable precision theatre -- fail instead of shipping it.
    """
    import re
    s = open(spec_path).read()
    bad = []
    for m in re.finditer(r'"[^"]*"', s):
        t = m.group(0)
        if re.search(':' + r'\d', t):
            bad.append(t[:70])
    return bad

if __name__ == '__main__':
    if '--all' in sys.argv:
        # Bulk mode. The per-diagram citation check existed but nothing ran it over every
        # FACTS.md, so it could only catch what someone remembered to point it at.
        import glob, importlib.util
        root = sys.argv[sys.argv.index('--all') + 1]
        here = os.path.dirname(os.path.abspath(__file__))
        mspec = importlib.util.spec_from_file_location('em', os.path.join(here, 'emit_manifest.py'))
        PROJ = {}
        try:
            src = open(os.path.join(here, 'emit_manifest.py')).read()
            ns = {}
            exec(src[src.index('PROJECT = {'):src.index('CITE = re.compile')], {'re': re}, ns)
            PROJ = ns['PROJECT']
        except Exception as e:
            print('  WARN could not read PROJECT map (%s); falling back to unscoped' % e)
        tot = 0
        for fp in sorted(glob.glob(os.path.join(os.path.dirname(here), '*_v*', 'FACTS.md'))):
            key = os.path.basename(os.path.dirname(fp))
            sc = None
            if key in PROJ:
                num, slug, _ = PROJ[key]
                sc = '%s-%s' % (num, slug)
            elif key not in PROJ:
                print('  WARN unmapped diagram (unscoped): %s' % key)
            tot += main(fp, root, sc)
        print("FACTS citation check: %d file(s) with unresolved citations" % tot)
        sys.exit(1 if tot else 0)

    if '--specs' in sys.argv:
        import glob
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        tot = 0
        for sp in sorted(glob.glob(os.path.join(root, '*_v*', 'spec.py'))):
            bad = check_spec_labels(sp)
            if bad:
                tot += len(bad)
                print("  %s: %d label(s) carry a line number" % (os.path.basename(os.path.dirname(sp)), len(bad)))
                for b in bad[:3]:
                    print("     ", b)
        print("spec-label check: %d violation(s)" % tot)
        sys.exit(1 if tot else 0)
    sys.exit(main(sys.argv[1], sys.argv[2]))
