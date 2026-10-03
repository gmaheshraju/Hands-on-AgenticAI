import { useRef } from 'react';

// Sticky tab row for long pages (framework pages; blog posts carry the same
// markup inline). Renders .post-tabs so Layout's tab-scroll reset and the
// "On this page" rail find it: panels must be its following siblings, all
// mounted and toggled with the `hidden` attribute so every tab prerenders.
//
// Keyboard: roving tabindex, Left/Right/Home/End move between tabs (WAI-ARIA tabs pattern).
export default function TabNav({ tabs, active, onChange }) {
  const refs = useRef([]);

  const onKeyDown = (e) => {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight' ? (active === last ? 0 : active + 1)
      : e.key === 'ArrowLeft' ? (active === 0 ? last : active - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(next);
    refs.current[next]?.focus();
    refs.current[next]?.click(); // same path as a pointer click, so Layout scrolls the new panel into view
  };

  return (
    <div className="tab-nav post-tabs" role="tablist" onKeyDown={onKeyDown}>
      {tabs.map((tab, i) => (
        <button
          key={tab}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          aria-selected={active === i}
          tabIndex={active === i ? 0 : -1}
          onClick={() => onChange(i)}
          className={`tab-nav__btn${active === i ? ' tab-nav__btn--active' : ''}`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
