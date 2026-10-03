import { Link } from 'react-router-dom';
import raw from '../../docs/diagrams/system_design_v1/system-design.svg?raw';
import { TOTALS } from '../data/diagrams';

// The front page's showcase: a real governed diagram (post 01's PR-review agent),
// inlined so it themes with the site, that draws itself left to right on load.
//
// The animation is pure CSS that starts at first paint, so the prerendered page
// animates without waiting for JavaScript, and hydration (which keeps the DOM)
// never replays it. Each zone/node/edge group gets a --d delay from its x position,
// and solid edges get pathLength="1" so CSS can draw them without measuring.
// Reduced-motion readers get the static diagram (see global.css).

const STAGGER_MS = 900; // left edge to right edge of the drawing
const GROUP = /<g class="(d-zone|d-node|d-edge)([^"]*)"([^>]*)>([\s\S]*?)<\/g>/g;

function firstX(kind, body) {
  const m = kind === 'd-edge' ? /points="([\d.]+),/.exec(body) : /<rect x="([\d.]+)"/.exec(body);
  return m ? parseFloat(m[1]) : 0;
}

function decorate(svg) {
  const xs = [...svg.matchAll(GROUP)].map((m) => firstX(m[1], m[4]));
  const min = Math.min(...xs);
  const span = Math.max(1, Math.max(...xs) - min);
  return svg.replace(GROUP, (whole, kind, rest, attrs, body) => {
    const t = (firstX(kind, body) - min) / span;
    // Zones settle first; nodes sweep left to right; edges trail the node they leave.
    const delay = kind === 'd-zone' ? Math.round(t * 200) : Math.round(t * STAGGER_MS) + (kind === 'd-edge' ? 180 : 60);
    // Dashed edge styles (artifact, analysis) keep their dash pattern and fade instead.
    const drawable = kind === 'd-edge' && !/d-edge-(artifact|analysis)/.test(rest);
    const inner = drawable ? body.replace(/<polyline /g, '<polyline pathLength="1" ') : body;
    return `<g class="${kind}${rest}"${attrs} style="--d:${delay}ms">${inner}</g>`;
  });
}

const svg = decorate(raw);

export default function HeroDiagram() {
  return (
    <figure className="hero-diagram">
      <div className="hero-diagram__frame" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="hero-diagram__caption">
        <span>
          <strong>Drawn from source.</strong> The PR-review agent from post 01: every box and arrow
          cites the line of code it came from.
        </span>
        <span className="hero-diagram__links">
          <Link to="/blog/ai-agent-system-design" className="link-draw">Read the post</Link>
          <Link to="/diagrams" className="link-draw">All {TOTALS.count} diagrams &rarr;</Link>
        </span>
      </figcaption>
    </figure>
  );
}
