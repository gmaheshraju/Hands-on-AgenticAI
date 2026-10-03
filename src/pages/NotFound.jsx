import { Link } from 'react-router-dom';

// Without this every unknown URL rendered the blog index at HTTP 200: a soft
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
        <Link to="/" className="btn btn--primary">
          Read the playbook <span className="btn__arrow" aria-hidden="true">&rarr;</span>
        </Link>
        <Link to="/home" className="btn btn--ghost">System design frameworks</Link>
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
    fontSize: 'clamp(36px, 5vw, 52px)',
    fontWeight: 400,
    lineHeight: 1.08,
    letterSpacing: '-0.02em',
    color: 'var(--text-h)',
    marginBottom: 18,
  },
  em: { fontStyle: 'italic', color: 'var(--text-accent)' },
  text: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.75, marginBottom: 26 },
  links: { display: 'flex', flexWrap: 'wrap', gap: 10 },
};
