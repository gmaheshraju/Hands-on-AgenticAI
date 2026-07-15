import { Link } from 'react-router-dom';
import FadeIn from '../components/FadeIn';

const posts = [
  {
    slug: 'ai-agent-system-design',
    number: '01',
    title: 'AI Agent System Design',
    subtitle: 'RAG pipelines, vector databases, function calling, evaluation loops — the full architecture of a production AI agent from ingestion to response.',
    tags: ['RAG', 'Vector DB', 'Function Calling', 'Evals', 'LLM Ops'],
    ready: true,
  },
  {
    slug: 'agent-memory-architecture',
    number: '02',
    title: 'Agent Memory Architecture',
    subtitle: 'Semantic vs episodic memory, context window management, retrieval patterns — how agents remember across sessions.',
    tags: ['Semantic Memory', 'Episodic', 'Context Window', 'Retrieval'],
    ready: true,
  },
  {
    slug: 'agent-harness-loop-engineering',
    number: '03',
    title: 'Agent Harness & Loop Engineering',
    subtitle: 'Orchestration loops, tracing, self-improvement, error recovery — the infrastructure that turns a prompt into a reliable agent.',
    tags: ['LLM Ops', 'Eval', 'Tracing', 'Loop Engineering'],
    ready: true,
  },
  {
    slug: 'multi-agent-systems',
    number: '04',
    title: 'Multi-Agent Systems',
    subtitle: 'Agent teams vs swarms, delegation patterns, shared memory, when single-agent beats multi-agent and vice versa.',
    tags: ['Agent Teams', 'Swarms', 'Delegation', 'Coordination'],
    ready: true,
  },
  {
    slug: 'rag-pipeline-deep-dive',
    number: '05',
    title: 'RAG Pipeline Deep Dive',
    subtitle: 'Chunking strategies, embedding models, hybrid search, reranking — building retrieval that actually works in production.',
    tags: ['Chunking', 'Embeddings', 'Hybrid Search', 'Reranking'],
    ready: true,
  },
  {
    slug: 'llm-ops',
    number: '06',
    title: 'LLMOps — Production LLM Infrastructure',
    subtitle: 'Model serving, cost routing, token budgeting, latency SLOs — the infrastructure that turns an LLM prototype into a system that handles 10M requests/day.',
    tags: ['Model Serving', 'Cost Routing', 'Latency', 'Caching', 'Monitoring'],
    ready: true,
  },
  {
    slug: 'ai-guardrails',
    number: '07',
    title: 'AI Guardrails & Safety',
    subtitle: 'Prompt injection defense, PII filtering, output validation, content moderation — the security layer that separates a demo from production.',
    tags: ['Prompt Injection', 'PII', 'Content Moderation', 'Defense in Depth'],
    ready: true,
  },
  {
    slug: 'evaluation-engineering',
    number: '08',
    title: 'Evaluation Engineering',
    subtitle: 'LLM-as-judge, golden datasets, regression testing, human-in-the-loop — how to know if your AI system actually works, and catch when it silently breaks.',
    tags: ['LLM-as-Judge', 'Golden Datasets', 'Regression', 'SLOs', 'HITL'],
    ready: true,
  },
  {
    slug: 'fine-tuning-vs-rag',
    number: '09',
    title: 'Fine-tuning vs Prompting vs RAG',
    subtitle: 'The decision framework every AI architect needs — when to prompt engineer, when to retrieve, when to fine-tune, and when to combine them.',
    tags: ['Fine-tuning', 'RAG', 'Prompt Engineering', 'LoRA', 'Cost Routing'],
    ready: true,
  },
  {
    slug: 'tool-use-function-calling',
    number: '10',
    title: 'Tool Use & Function Calling Patterns',
    subtitle: 'The engineering of reliable tool dispatch — schema design, validation, retry logic, permission models, and sandboxing.',
    tags: ['Tool Use', 'Function Calling', 'Sandboxing', 'Permissions', 'Error Recovery'],
    ready: true,
  },
  {
    slug: 'cost-latency-engineering',
    number: '11',
    title: 'Cost & Latency Engineering',
    subtitle: 'Your agent costs $2 per conversation. Your boss wants $0.15. Model routing, semantic caching, prompt compression, and the metrics that matter.',
    tags: ['Model Routing', 'Caching', 'Token Budgets', 'Latency', 'Cost Optimization'],
    ready: true,
  },
  {
    slug: 'ai-ux-patterns',
    number: '12',
    title: 'AI UX Patterns',
    subtitle: 'Streaming, confidence indicators, human-in-the-loop flows, error states — the product engineering that makes AI feel trustworthy.',
    tags: ['Streaming', 'Confidence', 'HITL', 'Trust', 'Error Recovery'],
    ready: true,
  },
  {
    slug: 'responsible-ai',
    number: '13',
    title: 'Responsible AI & Governance',
    subtitle: 'Bias detection, fairness metrics, red-teaming, model cards, EU AI Act — the governance that lets you ship AI without legal landmines.',
    tags: ['Bias', 'Fairness', 'Red-teaming', 'EU AI Act', 'Governance'],
    ready: true,
  },
  {
    slug: 'forward-deployed-engineering',
    number: '14',
    title: 'Forward Deployed Engineering',
    subtitle: 'The Palantir-pioneered model reshaping AI delivery — embedded engineers, Echo/Anthropic teams, demo-driven development, and the gravel-to-highway playbook.',
    tags: ['FDE', 'Palantir', 'AI Delivery', 'Echo/Anthropic', 'Go-to-Market'],
    ready: true,
  },
  {
    slug: 'context-engineering',
    number: '15',
    title: 'Context Engineering',
    subtitle: 'The discipline replacing prompt engineering — what goes into the context window, in what order, with what token budget, and why getting it wrong silently kills performance.',
    tags: ['Token Budget', 'Source Priority', 'Assembly', 'Caching', 'Lost in the Middle'],
    ready: true,
  },
  {
    slug: 'solo-developer-advantage',
    number: '16',
    title: 'The Solo Developer Advantage',
    subtitle: 'Why one developer with AI beats a team of twenty — and how engineers from anywhere in the world are building products that compete with giants.',
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
          Production architecture patterns for AI agents, RAG pipelines, and LLM systems — with real-world architecture diagrams and decision frameworks.
        </p>
      </section>

      <section style={styles.postsSection}>
        <h2 style={styles.sectionTitle}>Posts</h2>
        <div style={styles.grid}>
          {posts.map((p, i) => (
            <FadeIn key={p.slug} delay={i * 60}>
              <PostCard {...p} />
            </FadeIn>
          ))}
        </div>
      </section>
    </div>
  );
}

function PostCard({ slug, number, title, subtitle, tags, ready }) {
  const Wrapper = ready ? Link : 'div';
  const wrapperProps = ready ? { to: `/blog/${slug}` } : {};

  return (
    <Wrapper {...wrapperProps} style={{ ...styles.card, opacity: ready ? 1 : 0.5 }}>
      <div style={styles.accent} />
      <div style={styles.content}>
        <div style={styles.header}>
          <span style={styles.number}>{number}</span>
          <h3 style={styles.title}>{title}</h3>
          {!ready && <span style={styles.soon}>Coming</span>}
        </div>
        <p style={styles.subtitle}>{subtitle}</p>
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
      {ready && <span style={styles.arrow}>&rarr;</span>}
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
    marginBottom: 16,
  },
  link: {
    color: 'var(--text-accent)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
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
  soon: {
    fontSize: 10,
    color: 'var(--text-muted)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink: 0,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-p)',
    lineHeight: 1.65,
    marginBottom: 12,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    fontSize: 16,
    color: 'var(--text-muted)',
    transition: 'transform var(--dur) var(--ease)',
    flexShrink: 0,
  },
};
