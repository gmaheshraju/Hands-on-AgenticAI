import { Link } from 'react-router-dom';
import FadeIn from '../components/FadeIn';
import HeroDiagram from '../components/HeroDiagram';
import { metaText } from '../components/PostMeta';
import { ROUTES } from '../seo/routes';
import { TOTALS } from '../data/diagrams';
import { AUTHOR_NAME, PROJECTS_REPO } from '../data/contact';

const track = (name) => window.clarity?.('event', name);

// Card descriptions come from the same place as each post's meta description,
// so the index can never drift from what search results and link previews say.
const descriptionFor = (slug) => ROUTES.find((r) => r.path === `/blog/${slug}`)?.description;

const posts = [
  {
    slug: 'ai-agent-system-design',
    number: '01',
    title: 'AI Agent System Design',
    tags: ['RAG', 'Vector DB', 'Function Calling', 'Evals', 'LLM Ops'],
    ready: true,
    start: true,
  },
  {
    slug: 'agent-memory-architecture',
    number: '02',
    title: 'Agent Memory Architecture',
    tags: ['Semantic Memory', 'Episodic', 'Context Window', 'Retrieval'],
    ready: true,
  },
  {
    slug: 'agent-harness-loop-engineering',
    number: '03',
    title: 'Agent Harness & Loop Engineering',
    tags: ['LLM Ops', 'Eval', 'Tracing', 'Loop Engineering'],
    ready: true,
  },
  {
    slug: 'multi-agent-systems',
    number: '04',
    title: 'Multi-Agent Systems',
    tags: ['Agent Teams', 'Swarms', 'Delegation', 'Coordination'],
    ready: true,
  },
  {
    slug: 'rag-pipeline-deep-dive',
    number: '05',
    title: 'RAG Pipeline Deep Dive',
    tags: ['Chunking', 'Embeddings', 'Hybrid Search', 'Reranking'],
    ready: true,
  },
  {
    slug: 'llm-ops',
    number: '06',
    title: 'LLMOps: Production LLM Infrastructure',
    tags: ['Model Serving', 'Cost Routing', 'Latency', 'Caching', 'Monitoring'],
    ready: true,
  },
  {
    slug: 'ai-guardrails',
    number: '07',
    title: 'AI Guardrails & Safety',
    tags: ['Prompt Injection', 'PII', 'Content Moderation', 'Defense in Depth'],
    ready: true,
  },
  {
    slug: 'evaluation-engineering',
    number: '08',
    title: 'Evaluation Engineering',
    tags: ['LLM-as-Judge', 'Golden Datasets', 'Regression', 'SLOs', 'HITL'],
    ready: true,
  },
  {
    slug: 'fine-tuning-vs-rag',
    number: '09',
    title: 'Fine-tuning vs Prompting vs RAG',
    tags: ['Fine-tuning', 'RAG', 'Prompt Engineering', 'LoRA', 'Cost Routing'],
    ready: true,
  },
  {
    slug: 'tool-use-function-calling',
    number: '10',
    title: 'Tool Use & Function Calling Patterns',
    tags: ['Tool Use', 'Function Calling', 'Sandboxing', 'Permissions', 'Error Recovery'],
    ready: true,
  },
  {
    slug: 'cost-latency-engineering',
    number: '11',
    title: 'Cost & Latency Engineering',
    tags: ['Model Routing', 'Caching', 'Token Budgets', 'Latency', 'Cost Optimization'],
    ready: true,
  },
  {
    slug: 'ai-ux-patterns',
    number: '12',
    title: 'AI UX Patterns',
    tags: ['Streaming', 'Confidence', 'HITL', 'Trust', 'Error Recovery'],
    ready: true,
  },
  {
    slug: 'responsible-ai',
    number: '13',
    title: 'Responsible AI & Governance',
    tags: ['Bias', 'Fairness', 'Red-teaming', 'EU AI Act', 'Governance'],
    ready: true,
  },
  {
    slug: 'forward-deployed-engineering',
    number: '14',
    title: 'Forward Deployed Engineering',
    tags: ['FDE', 'Palantir', 'AI Delivery', 'Two-Team Model', 'Go-to-Market'],
    ready: true,
  },
  {
    slug: 'context-engineering',
    number: '15',
    title: 'Context Engineering',
    tags: ['Token Budget', 'Source Priority', 'Assembly', 'Caching', 'Lost in the Middle'],
    ready: true,
  },
  {
    slug: 'solo-developer-advantage',
    number: '16',
    title: 'The Solo Developer Advantage',
    tags: ['Solo Dev', 'AI Leverage', 'New Moats', 'Revenue/Employee', 'Career Strategy'],
    ready: true,
  },
];

export default function Blog() {
  return (
    <div>
      <section style={styles.hero}>
        <Link
          to="/work-with-me"
          className="hero-pill rise"
          style={{ '--i': 0 }}
          onClick={() => track('home_pill_workwithme_click')}
        >
          <span className="hero-pill__dot" aria-hidden="true" />
          Consulting on production agent systems
          <span className="btn__arrow" aria-hidden="true">&rarr;</span>
        </Link>
        <h1 className="rise" style={{ ...styles.h1, '--i': 1 }}>
          Agentic AI<br />
          <em className="swash" style={styles.h1em}>
            Playbook
            <svg className="swash__line" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
              <path d="M3 8.5 C 48 3, 118 2.5, 197 6.5" />
            </svg>
          </em>
        </h1>
        <p className="rise" style={{ ...styles.tagline, '--i': 2 }}>
          Production architecture patterns for AI agents, RAG pipelines, and LLM systems, with real-world architecture diagrams and decision frameworks.
        </p>
        <p className="hero-by rise" style={{ '--i': 3 }}>
          <span className="nav__monogram" aria-hidden="true">M</span>
          <span>By <strong>{AUTHOR_NAME}</strong>, who builds AI agent systems that run in production unattended.</span>
        </p>
        <div className="hero-actions rise" style={{ '--i': 4 }}>
          <Link
            to="/blog/ai-agent-system-design"
            className="btn btn--primary"
            onClick={() => track('home_start_reading_click')}
          >
            Start reading <span className="btn__arrow" aria-hidden="true">&rarr;</span>
          </Link>
          <Link
            to="/work-with-me"
            className="btn btn--ghost"
            onClick={() => track('home_hero_workwithme_click')}
          >
            Work with me
          </Link>
        </div>
        <div className="proof-strip rise" style={{ '--i': 5 }}>
          <a href="#posts" className="proof-strip__item">
            <span className="proof-strip__num">{posts.length}</span>
            <span className="proof-strip__label">in-depth guides, each one a full system</span>
          </a>
          <a href={PROJECTS_REPO} target="_blank" rel="noopener noreferrer" className="proof-strip__item">
            <span className="proof-strip__num">31</span>
            <span className="proof-strip__label">open-source agent projects on GitHub</span>
          </a>
          <Link to="/diagrams" className="proof-strip__item">
            <span className="proof-strip__num">{TOTALS.count}</span>
            <span className="proof-strip__label">diagrams where every box cites its source line</span>
          </Link>
        </div>
      </section>

      <HeroDiagram />

      <section style={styles.postsSection}>
        <h2 id="posts" style={{ ...styles.sectionTitle, scrollMarginTop: 88 }}>Posts</h2>
        <div className="post-grid">
          {posts.map((p, i) => (
            <FadeIn key={p.slug} delay={(i % 4) * 40} className="post-grid__cell">
              <PostCard {...p} />
            </FadeIn>
          ))}
        </div>
      </section>
    </div>
  );
}

function PostCard({ slug, number, title, tags, ready, start }) {
  const Wrapper = ready ? Link : 'div';
  const wrapperProps = ready ? { to: `/blog/${slug}` } : {};

  return (
    <Wrapper {...wrapperProps} className="post-card" style={{ ...styles.card, opacity: ready ? 1 : 0.5 }}>
      <div style={styles.accent} />
      <div style={styles.content}>
        <div style={styles.header}>
          <span style={styles.numberRow}>
            <span style={styles.number}>{number}</span>
            {start && <span className="post-card__start">Start here</span>}
          </span>
          <h3 style={styles.title}>{title}</h3>
          {!ready && <span style={styles.soon}>Coming</span>}
        </div>
        {metaText(slug) && <p className="post-card__meta">{metaText(slug)}</p>}
        <p style={styles.subtitle}>{descriptionFor(slug)}</p>
        <div style={styles.meta}>
          {tags && (
            <div style={styles.tags}>
              {tags.map(t => (
                <span key={t} style={styles.tag}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {ready && <span className="post-card__arrow" style={styles.arrow}>&rarr;</span>}
    </Wrapper>
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
    fontSize: 'clamp(40px, 4.6vw, 64px)',
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
    marginBottom: 18,
    maxWidth: '62ch',
  },
  postsSection: {
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
  card: {
    display: 'flex',
    alignItems: 'stretch',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    textDecoration: 'none',
    transition: 'all var(--dur) var(--ease)',
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
    padding: '22px 44px 20px 22px',
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
  numberRow: { display: 'flex', alignItems: 'center', gap: 10 },
  number: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-accent)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.02em',
    flexShrink: 0,
  },
  title: {
    fontSize: 23,
    fontWeight: 400,
    color: 'var(--text-h)',
    lineHeight: 1.3,
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.01em',
  },
  soon: {
    fontSize: 10,
    color: 'var(--text-muted)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink: 0,
  },
  subtitle: {
    fontSize: 14.5,
    color: 'var(--text-p)',
    lineHeight: 1.6,
    marginBottom: 16,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
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
  arrow: {
    position: 'absolute',
    top: 20,
    right: 18,
    fontSize: 16,
    color: 'var(--text-muted)',
    transition: 'transform var(--dur) var(--ease)',
    flexShrink: 0,
  },
};
