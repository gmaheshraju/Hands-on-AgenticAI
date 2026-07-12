export default function TabNav({ tabs, active, onChange }) {
  return (
    <div className="tab-nav">
      {tabs.map((tab, i) => (
        <button
          key={tab}
          onClick={() => onChange(i)}
          className={`tab-nav__btn${active === i ? ' tab-nav__btn--active' : ''}`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
