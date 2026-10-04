import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import FadeIn from '../components/FadeIn';
import { TOTALS } from '../data/diagrams';
import { EMAIL, LINKEDIN, PROJECTS_REPO } from '../data/contact';
import guardrailsSvg from '../../docs/diagrams/guardrails_v1/guardrails.svg?raw';

// Clarity custom events feed the consulting funnel (homepage → this page →
// contact click). Optional-chained: no-op locally and during prerender.
const track = (name) => window.clarity?.('event', name);

// A mailto: carries no referrer, so the subject line is the only attribution
// channel there is, and it answers the question that decides where to spend
// effort: which surface actually produces inquiries.
function inquirySubject() {
  if (typeof window === 'undefined') return 'Project inquiry';
  if (new URLSearchParams(window.location.search).get('from') === 'post') {
    return 'Project inquiry (from the playbook)';
  }
  const ref = document.referrer || '';
  if (/linkedin\./i.test(ref)) return 'Project inquiry (via LinkedIn)';
  if (/\b(x|twitter)\.com/i.test(ref)) return 'Project inquiry (via X)';
  if (/github\./i.test(ref)) return 'Project inquiry (via GitHub)';
  return 'Project inquiry';
}

const services = [
  {
    number: '01',
    title: 'AI Agent & RAG System Design',
    subtitle:
      'Architecture and hands-on build of production agent systems: retrieval pipelines, tool use, memory, evaluation loops. From blank page to a system your team can run and extend.',
    tags: ['Agents', 'RAG', 'Tool Use', 'Memory', 'Evals'],
  },
  {
    number: '02',
    title: 'LLM System Review & Hardening',
    subtitle:
      'Your prototype works in the demo and breaks in production. I audit the full stack (evals, guardrails, cost, latency, failure modes) and hand you a prioritized, concrete fix list.',
    tags: ['Architecture Review', 'Guardrails', 'Evaluation', 'Failure Modes'],
  },
  {
    number: '03',
    title: 'Cost & Latency Engineering',
    subtitle:
      'Model routing, semantic caching, prompt compression, token budgeting. The same conversation at a fraction of the cost, with the metrics to prove it held.',
    tags: ['Model Routing', 'Caching', 'Token Budgets', 'Monitoring'],
  },
  {
    number: '04',
    title: 'Team Enablement',
    subtitle:
      'Working sessions that move your engineers from prompt-and-pray to production discipline (context engineering, eval harnesses, agent loops), built on your codebase, not toy examples.',
    tags: ['Workshops', 'Context Engineering', 'Eval Harnesses', 'Pairing'],
  },
];

const steps = [
  {
    number: '1',
    title: 'Intro call',
    text: 'Thirty minutes, free. You describe the system or the problem; I tell you honestly whether I can help, and if I can’t, who might.',
  },
  {
    number: '2',
    title: 'Scoped proposal',
    text: 'A short written plan: deliverables, timeline, price. Fixed scope wherever possible, so you know what you’re buying before you commit.',
  },
  {
    number: '3',
    title: 'Build, review, hand off',
    text: 'Working code, eval coverage, and architecture diagrams where every box cites the line of code it came from, so the documentation cannot quietly rot after I leave. Your team owns the system, not a dependency on me.',
  },
];

const proof = [
  { stat: '31', label: 'Open-source LLM & agent projects', href: PROJECTS_REPO },
  { stat: TOTALS.citations.toLocaleString(), label: `Cited elements across ${TOTALS.count} governed diagrams`, href: '/diagrams' },
  { stat: '24/5', label: 'Live production systems I run myself', href: null },
];

// mailto: silently does nothing for visitors with no mail app configured (common on
// work laptops), so the address is always one click from the clipboard as well.
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

function CopyEmail() {
  // 'idle' | 'copied' | 'manual' (both clipboard paths refused: show the address to copy by hand)
  const [state, setState] = useState('idle');
  const copy = async () => {
    track('email_copy_click');
    let ok = false;
    try { await navigator.clipboard.writeText(EMAIL); ok = true; } catch { ok = legacyCopy(EMAIL); }
    setState(ok ? 'copied' : 'manual');
    if (ok) setTimeout(() => setState('idle'), 2000);
  };
  const label = state === 'copied' ? 'Copied ✓' : state === 'manual' ? EMAIL : 'Copy email';
  return (
    <button
      type="button"
      onClick={copy}
      className="btn btn--ghost"
      style={{ userSelect: state === 'manual' ? 'all' : 'none' }}
      aria-live="polite"
    >
      {label}
    </button>
  );
}

export default function WorkWithMe() {
  // Computed after hydration: it reads the URL and referrer, which the prerender
  // cannot know, and a render-time read would make the mailto href mismatch.
  const [subject, setSubject] = useState('Project inquiry');

  useEffect(() => {
    setSubject(inquirySubject());
    track('workwithme_view');
  }, []);

  return (
    <div>
      <section className="wwm-hero" style={styles.hero}>
        <div className="wwm-hero__text">
          <p className="rise" style={{ ...styles.eyebrow, '--i': 0 }}>Work With Me</p>
          <h1 className="rise" style={{ ...styles.h1, '--i': 1 }}>
            Ship AI systems that<br />
            <em className="swash" style={styles.h1em}>
              survive production
              <svg className="swash__line" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
                <path d="M3 8.5 C 48 3, 118 2.5, 197 6.5" />
              </svg>
            </em>
          </h1>
          <p className="rise" style={{ ...styles.tagline, '--i': 2 }}>
            I design, build, and harden agentic AI systems (agents, RAG pipelines,
            LLMOps) for teams that need them to work when real users show up.
            Everything I recommend, I&rsquo;ve run in production myself.
          </p>
          <div className="rise" style={{ ...styles.ctaRow, '--i': 3 }}>
            <a
              href={`mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`}
              onClick={() => track('email_cta_click')}
              className="btn btn--primary"
            >
              Email me <span className="btn__arrow" aria-hidden="true">&rarr;</span>
            </a>
            <a
              href={LINKEDIN}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('linkedin_cta_click')}
              className="btn btn--ghost"
            >
              Message on LinkedIn
            </a>
          </div>
          <p className="wwm-hero__reply rise" style={{ '--i': 4 }}>
            <span className="hero-pill__dot" aria-hidden="true" />
            Free 30-minute intro call. I reply within two working days.
          </p>
        </div>

        <aside className="wwm-proof rise" style={{ '--i': 3 }} aria-label="Evidence you can check">
          <p className="wwm-proof__label">Check the work first</p>
          <ul className="wwm-proof__list">
            {proof.map((p) => {
              const inner = (
                <>
                  <span className="wwm-proof__stat">{p.stat}</span>
                  <span className="wwm-proof__text">{p.label}</span>
                  {p.href && <span className="wwm-proof__arrow" aria-hidden="true">&rarr;</span>}
                </>
              );
              return (
                <li key={p.label}>
                  {!p.href ? (
                    <div className="wwm-proof__row">{inner}</div>
                  ) : p.href.startsWith('http') ? (
                    <a className="wwm-proof__row" href={p.href} target="_blank" rel="noopener noreferrer">{inner}</a>
                  ) : (
                    <Link className="wwm-proof__row" to={p.href}>{inner}</Link>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="wwm-proof__foot">
            The code and the diagrams are public. Read them before we talk, so the
            first call starts from your problem, not my pitch.
          </p>
        </aside>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>What I Do</h2>
        <div style={styles.grid}>
          {services.map((s, i) => (
            <FadeIn key={s.number} delay={i * 60} className="grid-cell">
              <div className="lift" style={styles.card}>
                <div style={styles.accent} />
                <div style={styles.content}>
                  <div style={styles.header}>
                    <span style={styles.number}>{s.number}</span>
                    <h3 style={styles.title}>{s.title}</h3>
                  </div>
                  <p style={styles.subtitle}>{s.subtitle}</p>
                  <div style={styles.tags}>
                    {s.tags.map(t => (
                      <span key={t} className="post-card__tag">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Why Me</h2>
        <FadeIn>
          <figure className="wwm-specimen">
            <div className="wwm-specimen__frame" dangerouslySetInnerHTML={{ __html: guardrailsSvg }} role="img"
              aria-label="Architecture of a prompt-injection defence pipeline, drawn from source: nine input checks, three defence layers, and the held-out grading path." />
            <figcaption className="wwm-specimen__cap">
              <span>The prompt-injection defence from post 07. Every box cites the line of code it came from.</span>
              <Link to="/diagrams" className="link-draw">See all {TOTALS.count} diagrams &rarr;</Link>
            </figcaption>
          </figure>
        </FadeIn>
        <p style={styles.proofNote}>
          The playbook on this site isn&rsquo;t theory I collected. It&rsquo;s the
          decision frameworks behind systems I operate every day. You get the
          engineer who wrote it, embedded in your problem.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>How It Works</h2>
        <div className="wwm-steps" style={styles.stepsGrid}>
          {steps.map((s, i) => (
            <FadeIn key={s.number} delay={i * 60} className="grid-cell">
              <div className="lift" style={styles.stepCard}>
                <span className="wwm-step__num">{s.number}</span>
                <div>
                  <h3 style={styles.stepTitle}>{s.title}</h3>
                  <p style={styles.stepText}>{s.text}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      <section className="wwm-closer">
        <h2 style={styles.closerTitle}>
          Building something with <em style={styles.h1em}>AI agents?</em>
        </h2>
        <p style={styles.closerText}>
          Tell me what you&rsquo;re building, where it breaks today, and your timeline.
          A few sentences is plenty. I read every message and reply within two working days.
        </p>
        <div style={styles.ctaRow}>
          <a
            href={`mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`}
            onClick={() => track('email_cta_click')}
            className="btn btn--primary"
          >
            {EMAIL}
          </a>
          <CopyEmail />
          <a
            href={LINKEDIN}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('linkedin_cta_click')}
            className="btn btn--ghost"
          >
            LinkedIn
          </a>
        </div>
      </section>
    </div>
  );
}

const styles = {
  hero: {
    marginBottom: '3.5rem',
    paddingBottom: '2.5rem',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-accent)',
    letterSpacing: '0.08em',
    marginBottom: 12,
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono)',
  },
  h1: {
    fontSize: 'clamp(40px, 4.6vw, 60px)',
    fontWeight: 400,
    color: 'var(--text-h)',
    lineHeight: 1.08,
    marginBottom: 20,
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.02em',
  },
  h1em: {
    fontStyle: 'italic',
    color: 'var(--text-accent)',
  },
  tagline: {
    fontSize: 'clamp(16px, 1.25vw, 19px)',
    color: 'var(--text-p)',
    lineHeight: 1.65,
    marginBottom: 28,
    maxWidth: '60ch',
  },
  ctaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  section: {
    marginBottom: '3.5rem',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 16,
    fontFamily: 'var(--font-mono)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
    gap: 16,
  },
  card: {
    display: 'flex',
    alignItems: 'stretch',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    position: 'relative',
    overflow: 'hidden',
    flex: 1,
  },
  accent: {
    width: 3,
    flexShrink: 0,
    background: 'var(--bg-accent-strong)',
    borderRadius: '10px 0 0 10px',
  },
  content: {
    flex: 1,
    padding: '24px 26px',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 10,
  },
  number: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-accent)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.02em',
    flexShrink: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: 400,
    color: 'var(--text-h)',
    lineHeight: 1.3,
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    fontSize: 15,
    color: 'var(--text-p)',
    lineHeight: 1.65,
    marginBottom: 18,
  },
  tags: {
    marginTop: 'auto',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
  },
  proofNote: {
    fontSize: 15,
    color: 'var(--text-p)',
    lineHeight: 1.7,
    maxWidth: '65ch',
    marginTop: 20,
  },
  stepsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 10,
  },
  stepCard: {
    display: 'flex',
    gap: 14,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '22px 24px',
    flex: 1,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: 400,
    color: 'var(--text-h)',
    fontFamily: 'var(--font-display)',
    marginBottom: 4,
  },
  stepText: {
    fontSize: 14.5,
    color: 'var(--text-p)',
    lineHeight: 1.65,
  },
  closerTitle: {
    fontSize: 'clamp(28px, 3vw, 40px)',
    fontWeight: 400,
    color: 'var(--text-h)',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.01em',
    marginBottom: 10,
  },
  closerText: {
    fontSize: 16,
    color: 'var(--text-p)',
    lineHeight: 1.7,
    marginBottom: 24,
    maxWidth: '60ch',
  },
};
