import { Link } from 'react-router-dom';

// Without this every unknown URL rendered the blog index at HTTP 200 — a soft
// 404 that wasted crawl budget and hid a real bug: /llms.txt returned the SPA
// shell for weeks and looked healthy because the status code said 200.
export default function NotFound() {
  return (
    <div style={styles.wrap}>
      <p style={styles.code}>404</p>
      <h1 style={styles.h1}>
        No page at<br />
        <em style={styles.em}>this address</em>
      </h1>
      <p style={styles.text}>
        The link is wrong or the page moved. The writing is all in one place.
      </p>
      <div style={styles.links}>
        <Link to="/" style={styles.primary}>Read the playbook &rarr;</Link>
        <Link to="/work-with-me" style={styles.secondary}>Work with me</Link>
      </div>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 640, padding: '3rem 0 5rem' },
  code: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: '0.14em',
    color: 'var(--text-accent)',
    marginBottom: 14,
  },
  h1: {
    fontFamily: 'var(--font-display)',
    fontSize: 44,
    fontWeight: 400,
    lineHeight: 1.08,
    letterSpacing: '-0.02em',
    color: 'var(--text-h)',
    marginBottom: 18,
  },
  em: { fontStyle: 'italic', color: 'var(--text-accent)' },
  text: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.75, marginBottom: 26 },
  links: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  primary: {
    padding: '10px 20px',
    background: 'var(--bg-accent-strong)',
    color: 'var(--text-on-accent)',
    borderRadius: 'var(--radius-full)',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  },
  secondary: {
    padding: '9px 20px',
    color: 'var(--text-h)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-full)',
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
  },
};
