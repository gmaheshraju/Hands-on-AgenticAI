#!/usr/bin/env /usr/bin/python3
"""Generate src/data/diagrams.js AND public/diagrams/*.svg from the specs.

Both are DERIVED. Never edit either by hand; re-run this script.

Why the SVGs are copied into public/ rather than imported with Vite's `?url`:
the ?url form resolves to a hashed asset in the client bundle but to the raw
source path during SSR, so the PRERENDERED html shipped 31 broken <img> paths
while the hydrated page looked fine. A crawler and the first paint would both
have seen nothing. public/ resolves identically in both, so the static HTML is
correct before any JS runs.

The gallery page must not be able to drift from the diagrams it shows: counts,
citations and file names all come from the same specs the build renders, so a
diagram that changes updates the page on the next build or fails loudly.
"""
import glob, importlib.util, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(ROOT))

PROJECT = {
 'system_design_v1':('01','agent-system-design','ai-agent-system-design'),
 'agent_memory_v1':('02','agent-memory','agent-memory-architecture'),
 'agent_harness_v1':('03','agent-harness','agent-harness-loop-engineering'),
 'multi_agent_v1':('04','multi-agent-systems','multi-agent-systems'),
 'rag_pipeline_v1':('05','rag-pipeline','rag-pipeline-deep-dive'),
 'llmops_v1':('06','llmops','llm-ops'),
 'guardrails_v1':('07','guardrails','ai-guardrails'),
 'eval_engineering_v1':('08','eval-engineering','evaluation-engineering'),
 'finetune_vs_rag_v1':('09','fine-tuning-vs-rag','fine-tuning-vs-rag'),
 'tool_use_v1':('10','tool-use','tool-use-function-calling'),
 'cost_latency_v1':('11','cost-latency','cost-latency-engineering'),
 'ai_ux_v1':('12','ai-ux','ai-ux-patterns'),
 'responsible_ai_v1':('13','responsible-ai','responsible-ai'),
 'forward_deployed_v1':('14','forward-deployed-engineering','forward-deployed-engineering'),
 'mcp_server_v1':('15','mcp-server',None),
 'coding_agent_v1':('16','ai-coding-agent',None),
 'voice_agent_v1':('17','voice-agent',None),
 'workflow_engine_v1':('18','workflow-engine',None),
 'observability_v1':('19','agent-observability',None),
 'ai_cli_v1':('20','ai-cli-tool',None),
 'coordinator_v1':('21','multi-agent-coordinator',None),
 'context_eng_v1':('22','context-engineering','context-engineering'),
 'long_running_v1':('23','long-running-agent',None),
 'llm_gateway_v1':('24','llm-gateway',None),
 'agent_executor_v1':('25','agent-executor',None),
 'agent_cicd_v1':('26','agent-cicd',None),
 'cost_attribution_v1':('27','cost-attribution',None),
 'compliance_audit_v1':('28','compliance-audit',None),
 'agent_mesh_v1':('29','agent-mesh',None),
 'self_improving_v1':('30','self-improving-agent',None),
 'agent_chat_v1':('31','agent-chat',None),
 # L2 (legality) diagrams — a different altitude of the same project
 'workflow_state_v1':('18','workflow-engine',None),
 'approval_state_v1':('25','agent-executor',None),
 # L2b (time) diagrams
 'agent_mesh_seq_v1':('29','agent-mesh',None),
 'gateway_budget_seq_v1':('24','llm-gateway',None),
 'coding_agent_seq_v1':('16','ai-coding-agent',None),
}
CITE = re.compile(r'[\w./-]+\.(?:js|mjs|jsx|ts|py):\d+')

rows = []
for d in sorted(glob.glob(os.path.join(ROOT, '*_v1'))):
    key = os.path.basename(d)
    if key not in PROJECT:
        print('  WARN unmapped folder:', key, file=sys.stderr); continue
    sp = importlib.util.spec_from_file_location('m_' + key, os.path.join(d, 'spec.py'))
    m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
    num, proj, post = PROJECT[key]
    cites = len(set(CITE.findall(open(os.path.join(d, 'FACTS.md')).read())))
    seq = hasattr(m, 'LIFELINES')
    rows.append({
        'n': num, 'dir': key, 'project': proj, 'post': post,
        # Altitude is DERIVED, not declared: a spec with LIFELINES is answering the
        # TIME question, one whose nodes carry state.* tokens is answering the
        # LEGALITY question, and anything else is answering the SPATIAL one. Reading
        # it off the spec means the badge cannot disagree with the picture -- there is
        # no second place to keep it in sync.
        'alt': ('L2b' if seq else
                'L2' if any(n[1].startswith('state.') for n in m.NODES) else 'L1'),
        'title': m.META['name'], 'desc': m.META['desc'],
        'svg': m.META['svg'],
        # A sequence has no boxes or zones; its shape is lifelines and messages. The
        # gallery tile reads whichever pair is real, so the caption never invents a
        # count that the picture does not contain.
        'nodes': len(m.LIFELINES) if seq else len(m.NODES),
        'edges': len(m.MESSAGES) if seq else len(m.EDGES),
        'zones': len(getattr(m, 'FRAGMENTS', [])) if seq else len(m.ZONES),
        'cites': cites,
    })
# Order within a project is ALTITUDE, not filename. The L1 map is the establishing
# shot -- you read where things live before you read which transitions are legal or
# what happens in what order. Sorting by directory name got this right for three
# projects by luck and wrong for the fourth: 'agent_mesh_seq_v1' sorts before
# 'agent_mesh_v1', so 29 showed its sequence diagram ahead of its map.
ALT_RANK = {'L1': 0, 'L2': 1, 'L2b': 2}
rows.sort(key=lambda r: (r['n'], ALT_RANK.get(r['alt'], 9), r['dir']))

# copy each rendered SVG into public/diagrams/ under a stable, unhashed name
import shutil
pub = os.path.join(REPO, 'public', 'diagrams')
os.makedirs(pub, exist_ok=True)
for r in rows:
    shutil.copyfile(os.path.join(ROOT, r['dir'], r['svg']), os.path.join(pub, r['svg']))
    r['src'] = '/diagrams/' + r['svg']

imports = ''
entries = ',\n'.join("  " + json.dumps(r) for r in rows)

out = """// GENERATED by docs/diagrams/_harness/emit_manifest.py — do not edit by hand.
// Counts and citations come from the same specs the build renders, so this page
// cannot drift from the diagrams it shows. SVGs live in public/diagrams/ (also
// generated) so that <img src> resolves identically in SSR and in the browser.
%s

export const DIAGRAMS = [
%s,
];

export const TOTALS = {
  count: %d,       // diagrams
  projects: %d,    // distinct systems -- fewer than `count`, because a project
                   // can carry more than one altitude (L1 space + L2 legality)
  citations: %d,
  nodes: %d,
};
""" % (imports, entries, len(rows), len({r['project'] for r in rows}),
        sum(r['cites'] for r in rows), sum(r['nodes'] for r in rows))

dest = os.path.join(REPO, 'src', 'data', 'diagrams.js')
os.makedirs(os.path.dirname(dest), exist_ok=True)
open(dest, 'w').write(out)
print("  wrote %s — %d diagrams over %d projects, %d citations, %d boxes"
      % (os.path.relpath(dest, REPO), len(rows), len({r["project"] for r in rows}),
         sum(r['cites'] for r in rows), sum(r['nodes'] for r in rows)))
