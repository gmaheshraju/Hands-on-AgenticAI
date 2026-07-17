export default function Insight({ type = 'staff', tag, children }) {
  const isWarn = type === 'warn';
  return (
    <div
      className="insight"
      style={{
        background: isWarn ? 'var(--bg-warning)' : 'var(--bg-accent)',
        borderLeftColor: isWarn ? 'var(--text-warning)' : 'var(--text-accent)',
      }}
    >
      <p
        className="insight__tag"
        style={{ color: isWarn ? 'var(--text-warning)' : 'var(--text-accent)' }}
      >
        {tag || (isWarn ? 'Warning' : 'Key insight')}
      </p>
      <p className="insight__text">{children}</p>
    </div>
  );
}
