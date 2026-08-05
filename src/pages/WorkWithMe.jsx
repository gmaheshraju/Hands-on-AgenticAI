import { useEffect } from 'react';
import FadeIn from '../components/FadeIn';

// Clarity custom events feed the consulting funnel (homepage → this page →
// contact click). Optional-chained: no-op locally and during prerender.
const track = (name) => window.clarity?.('event', name);

const EMAIL = 'maheshraju1218@gmail.com';
const LINKEDIN = 'https://www.linkedin.com/in/gmaheshraju/';
const GITHUB = 'https://github.com/gmaheshraju';

const services = [
  {
    number: '01',
    title: 'AI Agent & RAG System Design',
    subtitle:
      'Architecture and hands-on build of production agent systems — retrieval pipelines, tool use, memory, evaluation loops. From blank page to a system your team can run and extend.',
    tags: ['Agents', 'RAG', 'Tool Use', 'Memory', 'Evals'],
  },
  {
    number: '02',
    title: 'LLM System Review & Hardening',
    subtitle:
      'Your prototype works in the demo and breaks in production. I audit the full stack — evals, guardrails, cost, latency, failure modes — and hand you a prioritized, concrete fix list.',
    tags: ['Architecture Review', 'Guardrails', 'Evaluation', 'Failure Modes'],
  },
  {
    number: '03',
    title: 'Cost & Latency Engineering',
    subtitle:
      'Model routing, semantic caching, prompt compression, token budgeting. The same conversation at a fraction of the cost — with the metrics to prove it held.',
    tags: ['Model Routing', 'Caching', 'Token Budgets', 'Monitoring'],
  },
  {
    number: '04',
    title: 'Team Enablement',
    subtitle:
      'Working sessions that move your engineers from prompt-and-pray to production discipline — context engineering, eval harnesses, agent loops — built on your codebase, not toy examples.',
    tags: ['Workshops', 'Context Engineering', 'Eval Harnesses', 'Pairing'],
  },
];

const steps = [
  {
    number: '1',
    title: 'Intro call',
    text: 'Thirty minutes, free. You describe the system or the problem; I tell you honestly whether I can help — and if I can’t, who might.',
  },
  {
    number: '2',
    title: 'Scoped proposal',
    text: 'A short written plan: deliverables, timeline, price. Fixed scope wherever possible, so you know what you’re buying before you commit.',
  },
  {
    number: '3',
    title: 'Build, review, hand off',
    text: 'Working code, architecture docs, and eval coverage — delivered so your team owns it after I leave, not so you depend on me.',
  },
];

const proof = [
  { stat: '31', label: 'Production LLM & agent projects', href: GITHUB },
  { stat: '16', label: 'Published architecture deep dives', href: '/blog' },
  { stat: '24/5', label: 'Live production systems I run myself', href: null },
];

export default function WorkWithMe() {
  useEffect(() => {
    track('workwithme_view');
  }, []);

  return (
    <div>
      <section style={styles.hero}>
        <p style={styles.eyebrow}>Work With Me</p>
        <h1 style={styles.h1}>
          Ship AI systems that<br />
          <em style={styles.h1em}>survive production</em>
        </h1>
        <p style={styles.tagline}>
          I design, build, and harden agentic AI systems — agents, RAG pipelines,
          LLMOps — for teams that need them to work when real users show up.
          Everything I recommend, I&rsquo;ve run in production myself.
        </p>
        <div style={styles.ctaRow}>
          <a
            href={`mailto:${EMAIL}?subject=Project inquiry`}
            onClick={() => track('email_cta_click')}
            style={styles.ctaPrimary}
          >
            Email me &rarr;
          </a>
          <a
            href={LINKEDIN}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('linkedin_cta_click')}
            style={styles.ctaSecondary}
          >
            Message on LinkedIn
          </a>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>What I Do</h2>
        <div style={styles.grid}>
          {services.map((s, i) => (
            <FadeIn key={s.number} delay={i * 60}>
              <div style={styles.card}>
                <div style={styles.accent} />
                <div style={styles.content}>
                  <div style={styles.header}>
                    <span style={styles.number}>{s.number}</span>
                    <h3 style={styles.title}>{s.title}</h3>
                  </div>
                  <p style={styles.subtitle}>{s.subtitle}</p>
                  <div style={styles.tags}>
                    {s.tags.map(t => (
                      <span key={t} style={styles.tag}>{t}</span>
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
        <div style={styles.proofRow}>
          {proof.map((p, i) => (
            <FadeIn key={p.label} delay={i * 60}>
              {p.href ? (
                <a
                  href={p.href}
                  {...(p.href.startsWith('http')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  style={{ ...styles.proofCard, textDecoration: 'none' }}
                >
                  <span style={styles.proofStat}>{p.stat}</span>
                  <span style={styles.proofLabel}>{p.label} &rarr;</span>
                </a>
              ) : (
                <div style={styles.proofCard}>
                  <span style={styles.proofStat}>{p.stat}</span>
                  <span style={styles.proofLabel}>{p.label}</span>
                </div>
              )}
            </FadeIn>
          ))}
        </div>
        <p style={styles.proofNote}>
          The playbook on this site isn&rsquo;t theory I collected — it&rsquo;s the
          decision frameworks behind systems I operate every day. You get the
          engineer who wrote it, embedded in your problem.
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>How It Works</h2>
        <div style={styles.stepsGrid}>
          {steps.map((s, i) => (
            <FadeIn key={s.number} delay={i * 60}>
              <div style={styles.stepCard}>
                <span style={styles.stepNumber}>{s.number}</span>
                <div>
                  <h3 style={styles.stepTitle}>{s.title}</h3>
                  <p style={styles.stepText}>{s.text}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      <section style={styles.closer}>
        <h2 style={styles.closerTitle}>
          Building something with <em style={styles.h1em}>AI agents?</em>
        </h2>
        <p style={styles.closerText}>
          Tell me what you&rsquo;re trying to ship and where it hurts.
          I read every message and reply within two working days.
        </p>
        <div style={styles.ctaRow}>
          <a
            href={`mailto:${EMAIL}?subject=Project inquiry`}
            onClick={() => track('email_cta_click')}
            style={styles.ctaPrimary}
          >
            {EMAIL}
          </a>
          <a
            href={LINKEDIN}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('linkedin_cta_click')}
            style={styles.ctaSecondary}
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
    maxWidth: 1200,
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
    fontSize: 48,
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
    fontSize: 15,
    color: 'var(--text-p)',
    lineHeight: 1.75,
    marginBottom: 24,
    maxWidth: 640,
  },
  ctaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  ctaPrimary: {
    display: 'inline-block',
    padding: '10px 20px',
    background: 'var(--bg-accent-strong)',
    color: 'var(--text-on-accent)',
    borderRadius: 'var(--radius-full)',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    letterSpacing: '0.01em',
    transition: 'all var(--dur) var(--ease)',
  },
  ctaSecondary: {
    display: 'inline-block',
    padding: '9px 20px',
    background: 'transparent',
    color: 'var(--text-h)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-full)',
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
    letterSpacing: '0.01em',
    transition: 'all var(--dur) var(--ease)',
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
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  card: {
    display: 'flex',
    alignItems: 'stretch',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    position: 'relative',
    overflow: 'hidden',
  },
  accent: {
    width: 3,
    flexShrink: 0,
    background: 'var(--bg-accent-strong)',
    borderRadius: '10px 0 0 10px',
  },
  content: {
    flex: 1,
    padding: '18px 20px',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 6,
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
    fontSize: 17,
    fontWeight: 600,
    color: 'var(--text-h)',
    lineHeight: 1.3,
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-p)',
    lineHeight: 1.65,
    marginBottom: 12,
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
  },
  tag: {
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--text-muted)',
    background: 'var(--bg-code)',
    padding: '3px 8px',
    borderRadius: 'var(--radius-full)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.01em',
  },
  proofRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 10,
    marginBottom: 16,
  },
  proofCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '18px 20px',
    height: '100%',
  },
  proofStat: {
    fontSize: 32,
    fontWeight: 400,
    color: 'var(--text-accent)',
    fontFamily: 'var(--font-display)',
    lineHeight: 1,
  },
  proofLabel: {
    fontSize: 12,
    color: 'var(--text-p)',
    lineHeight: 1.5,
  },
  proofNote: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.7,
    fontStyle: 'italic',
    maxWidth: 640,
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
    padding: '18px 20px',
    height: '100%',
  },
  stepNumber: {
    fontSize: 24,
    fontWeight: 400,
    color: 'var(--text-accent)',
    fontFamily: 'var(--font-display)',
    lineHeight: 1.2,
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-h)',
    fontFamily: 'var(--font-display)',
    marginBottom: 4,
  },
  stepText: {
    fontSize: 13,
    color: 'var(--text-p)',
    lineHeight: 1.65,
  },
  closer: {
    background: 'var(--bg-accent)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '32px 28px',
    marginBottom: '3.5rem',
    maxWidth: 1200,
  },
  closerTitle: {
    fontSize: 28,
    fontWeight: 400,
    color: 'var(--text-h)',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.01em',
    marginBottom: 10,
  },
  closerText: {
    fontSize: 14,
    color: 'var(--text-p)',
    lineHeight: 1.7,
    marginBottom: 20,
    maxWidth: 560,
  },
};
