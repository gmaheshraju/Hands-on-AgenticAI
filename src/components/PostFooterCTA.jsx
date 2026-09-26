import { Link } from 'react-router-dom';
import Subscribe from './Subscribe';

// Rendered by Layout under every /blog/* post. Before this existed, all sixteen
// posts dead-ended: the site's whole traffic surface had no path to the offer.
export default function PostFooterCTA() {
  return (
    <aside style={styles.wrap}>
      <div style={styles.byline}>
        <span style={styles.mark}>MG</span>
        <p style={styles.bio}>
          Written by <strong style={styles.name}>Mahesh Guntumadugu</strong>. I build AI agent
          systems that run in production unattended, including one that trades real money every
          market day. Most of the work is not the model: it is context assembly, verification,
          recovery paths and cost control.
        </p>
      </div>

      <p style={styles.ask}>
        Stuck between a demo that works and a system you can trust with real users?{' '}
        <Link
          to="/work-with-me?from=post"
          onClick={() => window.clarity?.('event', 'post_footer_cta_click')}
          style={styles.link}
        >
          That is the work I take &rarr;
        </Link>
      </p>

      <Subscribe />
    </aside>
  );
}

const styles = {
  wrap: {
    maxWidth: 'var(--page-content-max)',
    margin: '4rem auto 0',
    padding: '28px 0 8px',
    borderTop: '1px solid var(--border)',
  },
  byline: { display: 'flex', gap: 14, alignItems: 'flex-start' },
  mark: {
    flexShrink: 0,
    width: 34,
    height: 34,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    background: 'var(--bg-accent-strong)',
    color: 'var(--text-on-accent)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 500,
  },
  bio: { fontSize: 13.5, color: 'var(--text-p)', lineHeight: 1.7 },
  name: { color: 'var(--text-h)', fontWeight: 600 },
  ask: { fontSize: 14, color: 'var(--text-p)', lineHeight: 1.7, marginTop: 16 },
  link: {
    color: 'var(--text-accent)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    fontWeight: 500,
  },
};
