import { Link } from 'react-router-dom';

// The System Design index's hero art, and its argument in one picture: the weak
// answer starts with a technology (struck out); the strong one walks the
// constraints in the Database Selection framework's order and names the store last.
// Plain HTML, so it prerenders, reads aloud as an ordered list, and themes for free.
// The rail draws and the steps arrive in sequence (CSS only, see CONSTRAINT CHAIN).

const STEPS = [
  { q: 'Scale', a: '30k reads/s, 2 TB and growing' },
  { q: 'Access', a: 'By customer, then by date range' },
  { q: 'Joins', a: 'None on the read path' },
  { q: 'Consistency', a: 'Read-after-write, per item' },
  { q: 'Writes', a: 'Append-only, steady' },
];

export default function ConstraintChain() {
  return (
    <figure className="chain" aria-label="A constraint-first answer to: where should order history live?">
      <figcaption className="chain__prompt">
        <span className="chain__kicker">Design review</span>
        Where should order history live?
      </figcaption>

      <p className="chain__weak">
        <span className="chain__weak-text">&ldquo;Let&rsquo;s use MongoDB, it scales.&rdquo;</span>
        <span className="chain__weak-tag">technology first</span>
      </p>

      <ol className="chain__list">
        {STEPS.map((s, i) => (
          <li key={s.q} className="chain__step" style={{ '--n': i }}>
            <span className="chain__q">{s.q}</span>
            <span className="chain__a">{s.a}</span>
          </li>
        ))}
        <li className="chain__step chain__step--answer" style={{ '--n': STEPS.length }}>
          <span className="chain__q">Store</span>
          <span className="chain__a">
            DynamoDB <span className="chain__key">pk customer_id · sk order_date</span>
          </span>
        </li>
      </ol>

      <Link to="/database-selection" className="chain__link link-draw">
        Walk the full decision tree &rarr;
      </Link>
    </figure>
  );
}
