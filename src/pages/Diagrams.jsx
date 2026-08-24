import { Link } from 'react-router-dom';
import FadeIn from '../components/FadeIn';
import { DIAGRAMS, TOTALS } from '../data/diagrams';

const REPO = 'https://github.com/gmaheshraju/Hands-on-AgenticAI';

/**
 * The gallery. Deliberately not a pitch.
 *
 * These are served as <img loading="lazy"> rather than inlined: at thumbnail size
 * theming is invisible, and lazy-loading means only what you scroll to ever loads.
 * That works because every SVG carries presentation attributes, so it renders with
 * no stylesheet at all.
 */
export default function Diagrams() {
  return (
    <div className="page-content">
      <p style={S.eyebrow}>Architecture</p>
      <h1 style={S.h1}>{TOTALS.count} systems, drawn from source</h1>
      <p style={S.sub}>
        Every box on these diagrams cites the line of code it came from — {TOTALS.citations.toLocaleString()} citations
        across {TOTALS.count} projects, each one checked against the source on every build. A diagram
        that cannot be checked is decoration.
      </p>

      <div style={S.note}>
        <p style={S.noteP}>
          <strong>On method.</strong> Each diagram was built from the code, not from the README. Where a
          project's own documentation described the system, that description was treated as a claim and
          verified. In <strong>24 of the 31</strong>, at least one documented claim did not survive the reading —
          a README describing subscriptions that lived elsewhere, layer counts that no longer matched, an
          audit surface undercounted by six. Six projects contained code that could not be reached at all.
        </p>
        <p style={S.noteP}>
          These are my own projects. I ran it on myself first.
        </p>
      </div>

      <div style={S.grid}>
        {DIAGRAMS.map((d, i) => (
          <FadeIn key={d.dir} delay={Math.min(i, 8) * 25}>
            <figure style={S.card}>
              <a href={`${REPO}/blob/main/docs/diagrams/${d.dir}/${d.src.split('/').pop()}`}
                 target="_blank" rel="noreferrer" style={S.frame}>
                <img src={d.src} alt={d.desc} loading="lazy" width="1700" style={S.img} />
              </a>
              <figcaption style={S.cap}>
                <span style={S.title}>
                  <span style={S.num}>{d.n}</span> {d.project}
                </span>
                <span style={S.stats}>
                  {d.nodes} boxes · {d.edges} edges · <strong>{d.cites} cited</strong>
                </span>
                <span style={S.links}>
                  <a href={`${REPO}/blob/main/docs/diagrams/${d.dir}/FACTS.md`} target="_blank" rel="noreferrer" style={S.a}>facts</a>
                  <a href={`${REPO}/tree/main/projects/${d.n}-${d.project}`} target="_blank" rel="noreferrer" style={S.a}>source</a>
                  {d.post && <Link to={`/blog/${d.post}`} style={S.a}>write-up</Link>}
                </span>
              </figcaption>
            </figure>
          </FadeIn>
        ))}
      </div>

      <p style={S.foot}>
        I do this as consulting work — architecture recovered from code, for systems that outgrew their
        documentation. If yours needs it, <a href="/work-with-me" style={S.a}>the details are here</a>.
      </p>
    </div>
  );
}

const S = {
  eyebrow: { fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--text-accent)', marginBottom: 8 },
  h1: { fontFamily: 'var(--font-display)', fontSize: 'clamp(30px,4vw,44px)', fontWeight: 400, margin: '0 0 14px' },
  sub: { fontSize: 16, lineHeight: 1.65, color: 'var(--text-p)', maxWidth: 720, marginBottom: 26 },
  note: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid var(--bg-accent-strong)', borderRadius: 'var(--radius-md)', padding: '16px 20px', maxWidth: 720, marginBottom: 40 },
  noteP: { fontSize: 14, lineHeight: 1.7, color: 'var(--text-p)', margin: '0 0 8px' },
  grid: { display: 'grid', gap: 26, gridTemplateColumns: 'repeat(auto-fill,minmax(420px,1fr))' },
  card: { margin: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' },
  frame: { display: 'block', padding: 10, background: 'var(--bg-card)' },
  img: { width: '100%', height: 'auto', display: 'block' },
  cap: { padding: '10px 14px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 },
  title: { fontSize: 14, fontWeight: 600 },
  num: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginRight: 6 },
  stats: { fontSize: 12.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' },
  links: { display: 'flex', gap: 14, marginTop: 4, fontSize: 12.5 },
  a: { color: 'var(--bg-accent-strong)', textDecoration: 'none' },
  foot: { marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--border)', fontSize: 14, color: 'var(--text-muted)', maxWidth: 720, lineHeight: 1.7 },
};
