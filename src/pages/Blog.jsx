import { Link } from 'react-router-dom';
import FadeIn from '../components/FadeIn';
import { ROUTES } from '../seo/routes';

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
        <p style={styles.eyebrow}>AI Engineering</p>
        <h1 style={styles.h1}>
          Agentic AI<br />
          <em style={styles.h1em}>Playbook</em>
        </h1>
        <p style={styles.tagline}>
          Production architecture patterns for AI agents, RAG pipelines, and LLM systems, with real-world architecture diagrams and decision frameworks.
        </p>
        <p style={styles.heroCta}>
          Building something with AI agents?{' '}
          <Link
            to="/work-with-me"
            onClick={() => window.clarity?.('event', 'home_hero_workwithme_click')}
            style={styles.link}
          >
            Work with me &rarr;
          </Link>
        </p>
      </section>

      <section style={styles.postsSection}>
        <h2 style={styles.sectionTitle}>Posts</h2>
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

function PostCard({ slug, number, title, tags, ready }) {
  const Wrapper = ready ? Link : 'div';
  const wrapperProps = ready ? { to: `/blog/${slug}` } : {};

  return (
    <Wrapper {...wrapperProps} className="post-card" style={{ ...styles.card, opacity: ready ? 1 : 0.5 }}>
      <div style={styles.accent} />
      <div style={styles.content}>
        <div style={styles.header}>
          <span style={styles.number}>{number}</span>
          <h3 style={styles.title}>{title}</h3>
          {!ready && <span style={styles.soon}>Coming</span>}
        </div>
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
    marginBottom: 16,
    maxWidth: '62ch',
  },
  link: {
    color: 'var(--text-accent)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
  heroCta: {
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  vision: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.7,
    fontStyle: 'italic',
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
