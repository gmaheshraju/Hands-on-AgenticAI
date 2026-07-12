import { Link } from 'react-router-dom';

export default function ComingSoon({ number, title, description }) {
  return (
    <div style={{ maxWidth: 800, paddingTop: '2rem' }}>
      <p style={styles.eyebrow}>Framework {number}</p>
      <h1 style={styles.h1}>{title}</h1>
      <p style={styles.desc}>{description}</p>
      <div style={styles.box}>
        <p style={styles.boxText}>This framework is being built. Check back soon.</p>
      </div>
      <Link to="/" style={styles.back}>← Back to all frameworks</Link>
    </div>
  );
}

const styles = {
  eyebrow: { fontSize: 12, fontWeight: 600, color: 'var(--text-accent)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 },
  h1: { fontSize: 32, fontWeight: 700, color: 'var(--text-h)', marginBottom: 12, lineHeight: 1.2, fontFamily: 'var(--font-display)' },
  desc: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.7, marginBottom: 28 },
  box: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '2rem', textAlign: 'center', marginBottom: 24 },
  boxText: { fontSize: 14, color: 'var(--text-muted)' },
  back: { fontSize: 14, fontWeight: 500, color: 'var(--text-accent)', textDecoration: 'none' },
};
