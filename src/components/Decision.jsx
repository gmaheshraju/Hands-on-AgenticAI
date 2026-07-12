export default function Decision({ question, children }) {
  return (
    <div className="decision">
      <p className="decision__q">
        <span className="decision__icon">&rsaquo;</span>
        {question}
      </p>
      <div className="decision__body">{children}</div>
    </div>
  );
}

export function Pill({ type, children }) {
  const colors = {
    green: { bg: 'var(--bg-success)', color: 'var(--text-success)' },
    amber: { bg: 'var(--bg-warning)', color: 'var(--text-warning)' },
    red: { bg: 'var(--bg-danger)', color: 'var(--text-danger)' },
  };
  const c = colors[type] || colors.green;
  return (
    <span className="pill" style={{ background: c.bg, color: c.color }}>
      {children}
    </span>
  );
}
