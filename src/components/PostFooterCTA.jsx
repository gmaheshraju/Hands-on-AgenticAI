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

      <div style={styles.card}>
        <p style={styles.ask}>
          Stuck between a demo that works and a system you can trust with real users?
          That is the work I take.
        </p>
        <Link
          to="/work-with-me?from=post"
          onClick={() => window.clarity?.('event', 'post_footer_cta_click')}
          className="btn btn--primary"
        >
          Work with me <span className="btn__arrow" aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      <Subscribe />
    </aside>
  );
}

const styles = {
  // Width and horizontal position come from `.layout-main--post > aside` in global.css,
  // so the byline lines up with the reading column at every breakpoint.
  wrap: {
    marginTop: '4rem',
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
  bio: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.7 },
  name: { color: 'var(--text-h)', fontWeight: 600 },
  card: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 22,
    padding: '20px 22px',
    background: 'var(--bg-accent)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
  },
  ask: { fontSize: 15, color: 'var(--text-h)', lineHeight: 1.6, flex: '1 1 320px' },
};
