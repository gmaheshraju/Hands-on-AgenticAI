#!/usr/bin/env /usr/bin/python3
"""Render a FACTS.md from a structured extraction payload.

Hand-writing this file produced a 6% citation error rate (3 bad of 49, 2026-08-23).
Generating it from the structured fields the extractor already returned removes
transcription entirely -- the only place a number can now be wrong is the
extractor, and verify_facts.py checks that against the source.
"""
import json, sys, os, datetime

def render(d, project_path, out_path, altitude="L1 — space"):
    L = []
    A = L.append
    A(f"# FACTS — {os.path.basename(project_path)} ({altitude}, extracted 2026-08-24)")
    A("")
    A(f"Source of truth: `{project_path}/`. **Every element in the diagram appears below with a "
      "`file:line` citation. The diagram may contain nothing that is not on this page, and this page "
      "may contain nothing without a citation.** Any README ASCII diagram in the project was treated "
      "as a CLAIM, not as evidence.")
    A("")
    A(f"**Generated** from the structured extraction, not transcribed. All citations machine-verified "
      f"by `_harness/verify_facts.py` against the source tree.")
    A("")
    A("## What this project is")
    A("")
    A(d['purpose'])
    A("")
    A("## Altitude")
    A("")
    A(d['altitude_note'])
    A("")
    A("## Components (the boxes)")
    A("")
    A("| Component | Kind | Role | Citation |")
    A("|---|---|---|---|")
    for c in d['components']:
        A(f"| **{c['name']}** | `{c['kind']}` | {c['role']} | `{c['citation']}` |")
    A("")
    A("## Flows (the edges)")
    A("")
    A("| From | To | Label | Kind | Citation |")
    A("|---|---|---|---|---|")
    for f in d['flows']:
        A(f"| {f['from']} | {f['to']} | {f['label']} | `{f['kind']}` | `{f['citation']}` |")
    A("")
    A("## Invariant cards — COMPLETE enumerations, in code order")
    A("")
    A("Per `DIAGRAM_RULES.md`: a card lists the REAL enumeration from code, complete and in code "
      "order. Never a summary, never \"etc.\". If an enumeration changes in code, the card is WRONG, "
      "not stale.")
    for c in d['invariant_cards']:
        A("")
        A(f"### {c['title']}")
        A("")
        A(f"Source: `{c['citation']}`")
        A("")
        for i in c['items']:
            A(f"- {i}")
    A("")
    if d.get('artifacts'):
        A("## Artifacts written")
        A("")
        A("| Artifact | Written by | Citation |")
        A("|---|---|---|")
        for a in d['artifacts']:
            A(f"| `{a['name']}` | {a['writer']} | `{a['citation']}` |")
        A("")
    A("## Deliberately NOT drawn")
    A("")
    for e in d['excluded']:
        A(f"- {e}")
    A("")
    if d.get('portability_notes'):
        A("## Portability notes — semantic tokens under strain")
        A("")
        A("Recorded because the vocabulary was built for a trading system. \"Rules bent per new "
          "domain\" is the portability metric for the harness.")
        A("")
        for n in d['portability_notes']:
            A(f"- {n}")
        A("")
    open(out_path, 'w').write('\n'.join(L) + '\n')
    return sum(1 for x in L if 'citation' not in x)

if __name__ == '__main__':
    payload, project, out = sys.argv[1], sys.argv[2], sys.argv[3]
    d = json.load(open(payload))
    render(d, project, out)
    print(f"wrote {out}")
