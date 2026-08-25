#!/usr/bin/env /usr/bin/python3
"""Prove every lint check still FIRES. The harness that watches the harness.

Written 2026-08-25, after testing the L2b checks by hand found that one of them
-- msg_label_overlap -- could not fire at all: a by-construction constant already
made the condition it looked for unreachable. It had passed every build since the
day it was written, and passing was meaningless.

A check that cannot fail is worse than no check. It reports CLEAN, it costs a line
in every LINT.md, and it buys a false sense that the surface is guarded. The only
way to know a check works is to break the thing it guards and watch it complain,
so that is what this file does: for each check, mutate a real spec into a specific
defect and assert the check reports it.

Two directions, and BOTH matter:
  - every case must FIRE its own check (a dead check is caught)
  - the unmutated specs must stay CLEAN (a check that fires on everything is
    caught too, which is the failure mode a self-test can otherwise create)

Usage: /usr/bin/python3 _harness/selftest.py
Exit 1 if any check fails to fire on its own defect, or fires on a clean spec.
"""
import importlib.util, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import render, render_seq, lint            # noqa: E402

L2  = os.path.join(ROOT, 'workflow_state_v1')
SEQ = os.path.join(ROOT, 'agent_mesh_seq_v1')


def load(d):
    """Fresh module every time -- the cases mutate it in place."""
    s = importlib.util.spec_from_file_location('selftest_spec', os.path.join(d, 'spec.py'))
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


def theme(d):
    return os.path.join(d, 'hoa-default.json')


# ---------------------------------------------------------------- L1 / L2 cases
def m_collinear(m):
    """Two parallel lanes closer than LANE_MIN."""
    e = list(m.EDGES[2]); e[7] = [(864, 244), (552, 244)]      # 12px from t_done's lane
    m.EDGES[2] = tuple(e)

def m_through_node(m):
    """An edge routed straight through a node it does not connect."""
    e = list(m.EDGES[3]); e[7] = [(596, 296), (1160, 296)]     # crosses s_wait
    m.EDGES[3] = tuple(e)

def m_gutters(m):
    """A second, non-nested zone too close to the first."""
    m.ZONES = list(m.ZONES) + [('z_two', 'a second zone', 'boundary.external', 1480, 128, 200, 400)]

def m_straddle(m):
    """A card half in and half out of a boundary."""
    n = list(m.NODES[5]); n[4] = 480                            # crosses the zone's bottom edge
    m.NODES[5] = tuple(n)

def m_overflow(m):
    """Text wider than the box drawn around it."""
    n = list(m.NODES[0]); n[2] = '<b>' + 'X' * 90 + '</b>'
    m.NODES[0] = tuple(n)

def m_label_overlap(m):
    """Two edge labels forced onto the same spot.

    The renderer dodges labels into free slots, so this must exhaust every slot:
    a very long label on two edges whose only segments share a midpoint band.
    """
    for i in (0, 1):
        e = list(m.EDGES[i]); e[3] = 'a deliberately long edge label ' * 3
        m.EDGES[i] = tuple(e)


# ---------------------------------------------------------------- L2b cases
def s_offpage(m):
    """A label so long it runs off the canvas."""
    x = list(m.MESSAGES[0]); x[3] = 'submitWork ' + 'and a great deal more text besides ' * 4
    m.MESSAGES[0] = tuple(x)

def s_crosses_note(m):
    """A note dragged up into the message field."""
    n = list(m.NOTES[0]); n[3], n[4] = 600, 480
    m.NOTES[0] = tuple(n)

def s_note_on_lifeline(m):
    s_crosses_note(m)

def s_over_frag_tab(m):
    """A fragment slid up so its title bar lands on the first label inside it.

    Moving the FRAGMENT rather than the message: shifting a message here would trip
    the strictly-increasing-y assert before the lint could see anything, which is
    exactly what the first version of this case did.
    """
    f = list(m.FRAGMENTS[0])
    bottom = f[3] + f[5]
    inside = [x[5] for x in m.MESSAGES if f[3] <= x[5] <= bottom]
    f[3] = min(inside) - 12                 # tab now overlaps that message's label
    f[5] = bottom - f[3]
    m.FRAGMENTS[0] = tuple(f)

def s_lifeline_offpage(m):
    """A lifeline whose header runs off the right edge."""
    l = list(m.LIFELINES[-1]); l[3] = m.META['w'] - 40
    m.LIFELINES[-1] = tuple(l)

def s_overflow_lifeline(m):
    """A lifeline header is a fixed width however long its label is."""
    l = list(m.LIFELINES[3]); l[2] = '<b>' + 'CircuitBreakerRegistry' * 3 + '</b>'
    m.LIFELINES[3] = tuple(l)

def s_overflow_fragment(m):
    """A fragment title wider than the fragment clips silently."""
    f = list(m.FRAGMENTS[1]); f[1] = 'alt — ' + 'x' * 240
    m.FRAGMENTS[1] = tuple(f)


# ---------------------------------------------------------------- build asserts
def a_order(m):
    x = list(m.MESSAGES[3]); x[5] = 300                        # above its predecessor
    m.MESSAGES[3] = tuple(x)

def a_empty_fragment(m):
    f = list(m.FRAGMENTS[2]); f[2], f[3], f[4], f[5] = 400, 940, 200, 16
    m.FRAGMENTS[2] = tuple(f)

def a_lifeline_gap(m):
    l = list(m.LIFELINES[2]); l[3] = 660                       # too close to its neighbour
    m.LIFELINES[2] = tuple(l)

def a_offgrid(m):
    n = list(m.NODES[0]); n[3] = 161                           # not a multiple of GRID
    m.NODES[0] = tuple(n)

def a_diagonal(m):
    e = list(m.EDGES[0]); e[7] = [(400, 200)]                  # forces a non-axis-aligned run
    m.EDGES[0] = tuple(e)


LINT_CASES = [
    ('collinear',          L2,  m_collinear,          'collinear'),
    ('through_node',       L2,  m_through_node,       'through_node'),
    ('gutters',            L2,  m_gutters,            'gutters'),
    ('straddle',           L2,  m_straddle,           'straddle'),
    ('overflow',           L2,  m_overflow,           'overflow'),
    ('label_overlap',      L2,  m_label_overlap,      'label_overlap'),
    ('msg_label_offpage',  SEQ, s_offpage,            'msg_label_offpage'),
    ('msg_over_frag_tab',  SEQ, s_over_frag_tab,      'msg_over_frag_tab'),
    ('lifeline_offpage',   SEQ, s_lifeline_offpage,   'lifeline_offpage'),
    ('msg_crosses_note',   SEQ, s_crosses_note,       'msg_crosses_note'),
    ('note_on_lifeline',   SEQ, s_note_on_lifeline,   'note_on_lifeline'),
    ('overflow/lifeline',  SEQ, s_overflow_lifeline,  'overflow'),
    ('overflow/fragment',  SEQ, s_overflow_fragment,  'overflow'),
]

ASSERT_CASES = [
    ('message order',      SEQ, a_order,           'declaration order'),
    ('empty fragment',     SEQ, a_empty_fragment,  'contains no message'),
    ('lifeline spacing',   SEQ, a_lifeline_gap,    'apart'),
    ('grid quantum',       L2,  a_offgrid,         'not divisible'),
    ('axis-aligned path',  L2,  a_diagonal,        'not axis-aligned'),
]


def build(d, mutate=None):
    m = load(d)
    if mutate:
        mutate(m)
    if d == SEQ:
        sp = render_seq.SeqSpec(m, theme(d))
        return sp, lint.run_seq(sp, render_seq)
    sp = render.Spec(m, theme(d))
    return sp, lint.run(sp, render)


def main():
    fails = []

    # direction 1: the real specs must be CLEAN, or a check that fires on
    # everything would look like a passing self-test.
    for d in (L2, SEQ):
        _sp, res = build(d)
        n = sum(len(v) for v in res.values())
        name = os.path.basename(d)
        print('  baseline %-22s %s' % (name, 'CLEAN' if n == 0 else '%d VIOLATION(S) <-- ' % n + repr(res)))
        if n:
            fails.append('baseline %s is not clean' % name)

    # direction 2: every lint check fires on its own defect.
    print()
    for name, d, mutate, key in LINT_CASES:
        try:
            _sp, res = build(d, mutate)
        except AssertionError as e:
            print('  lint   %-22s BUILD ASSERTED FIRST: %s' % (name, str(e)[:52]))
            fails.append('%s: a build assert fired before the lint could' % name)
            continue
        hits = res.get(key, [])
        print('  lint   %-22s %s' % (name, 'FIRES (%d)' % len(hits) if hits else 'DID NOT FIRE  <-- dead check?'))
        if not hits:
            fails.append('%s did not fire on its own defect' % name)

    # direction 3: every build-time assert fires on its own defect.
    print()
    for name, d, mutate, needle in ASSERT_CASES:
        try:
            build(d, mutate)
            print('  assert %-22s DID NOT FIRE  <-- invariant not enforced' % name)
            fails.append('%s assert did not fire' % name)
        except AssertionError as e:
            ok = needle in str(e)
            print('  assert %-22s %s' % (name, 'FIRES' if ok else 'fired with an UNEXPECTED message: ' + str(e)[:44]))
            if not ok:
                fails.append('%s asserted for the wrong reason' % name)

    print()
    if fails:
        print('SELFTEST FAILED (%d):' % len(fails))
        for f in fails:
            print('   -', f)
        return 1
    print('selftest: %d lint checks and %d build asserts all fire; both baselines clean'
          % (len(LINT_CASES), len(ASSERT_CASES)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
