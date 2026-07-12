import { Link } from 'react-router-dom';

export default function FrameworkCard({ to, number, title, subtitle, tags, ready }) {
  return (
    <Link to={to} className="fc">
      <div className="fc__accent" />
      <div className="fc__content">
        <div className="fc__header">
          <span className="fc__number">{number}</span>
          <h3 className="fc__title">{title}</h3>
          {!ready && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Soon</span>}
        </div>
        <p className="fc__subtitle">{subtitle}</p>
        {tags && (
          <div className="fc__tags">
            {tags.map(t => (
              <span key={t} className="fc__tag">{t}</span>
            ))}
          </div>
        )}
      </div>
      <span className="fc__arrow">&rarr;</span>
    </Link>
  );
}
