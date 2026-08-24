#!/usr/bin/env /usr/bin/python3
"""Every file:line citation in a FACTS.md must resolve to a non-blank line.

Hand-written citations drift immediately: writing ONE facts file by hand on
2026-08-23 produced 3 wrong line numbers out of 49 (6%) despite care. This is
why citations are machine-checked, not reviewed.

Usage: verify_facts.py <FACTS.md> <source-root>
Exit 1 on any unresolved citation.
"""
import re, sys, os

def main(facts_path, src_root):
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
            base = os.path.basename(f)
            for dirpath, _, names in os.walk(src_root):
                if 'node_modules' in dirpath: continue
                if base in names:
                    p = os.path.join(dirpath, base); break
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

if __name__ == '__main__':
    sys.exit(main(sys.argv[1], sys.argv[2]))
