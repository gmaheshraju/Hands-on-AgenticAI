import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CORE, NODES, project, nearness } from './model';

// The hero's 3D centrepiece. What ships in the HTML is a ring of real links, placed
// with the same projection the scene uses, so search engines, no-JS readers and the
// first paint all get the finished layout. The WebGL scene (three.js, its own chunk)
// loads once the browser is idle and draws underneath the same links.

const track = (name) => window.clarity?.('event', name);
const at = (p) => {
  const pr = project(p);
  const near = nearness(pr.depth);
  return { left: `${pr.left.toFixed(2)}%`, top: `${pr.top.toFixed(2)}%`, zIndex: 10 + Math.round(near * 50), '--near': near.toFixed(3) };
};

export default function AgentOrbit() {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRefs = useRef([]);
  const coreRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    let cancelled = false;
    let idle = 0;

    const webgl = (() => {
      try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
      } catch { return false; }
    })();
    if (!webgl) return undefined;

    const start = () => {
      import('./scene').then(({ createOrbitScene }) => {
        if (cancelled) return;
        try {
          sceneRef.current = createOrbitScene({
            canvas: canvasRef.current,
            container: root,
            labels: labelRefs.current,
            coreLabel: coreRef.current,
            reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          });
          root.classList.add('is-live');
        } catch {
          // A driver that advertises WebGL but fails to build a context: keep the static ring.
        }
      }).catch(() => { /* chunk failed to load (offline): the static ring stays */ });
    };
    // Let the page finish its own work (hydration, fonts, entrance motion) first.
    if ('requestIdleCallback' in window) idle = window.requestIdleCallback(start, { timeout: 1200 });
    else idle = window.setTimeout(start, 300);

    return () => {
      cancelled = true;
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      root.classList.remove('is-live');
    };
  }, []);

  const hover = (i) => () => sceneRef.current?.highlight(i);
  const leave = () => sceneRef.current?.highlight(-1);

  return (
    <div ref={rootRef} className="orbit" aria-label="The parts of a production agent, each linked to its guide" role="group">
      <canvas ref={canvasRef} className="orbit__canvas" aria-hidden="true" />
      <div className="orbit__fallback" aria-hidden="true" />
      <Link
        ref={coreRef}
        to={CORE.to}
        className="orbit__core"
        style={{ ...at([0, -0.98, 0]), zIndex: 70 }}
        onPointerEnter={hover(-2)}
        onPointerLeave={leave}
        onFocus={hover(-2)}
        onBlur={leave}
        onClick={() => track('home_orbit_core_click')}
      >
        {CORE.label}
      </Link>
      {NODES.map((n, i) => (
        <Link
          key={n.to}
          ref={(el) => { labelRefs.current[i] = el; }}
          to={n.to}
          className="orbit__label"
          style={at(n.p)}
          onPointerEnter={hover(i)}
          onPointerLeave={leave}
          onFocus={hover(i)}
          onBlur={leave}
          onClick={() => track('home_orbit_node_click')}
        >
          {n.label}
          <span className="orbit__dot" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
