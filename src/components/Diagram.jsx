import FadeIn from './FadeIn';

/**
 * A governed architecture diagram.
 *
 * The SVG is imported with Vite's `?raw` and inlined, NOT served via <img>.
 * That is deliberate: <img> sandboxes the SVG so the page stylesheet cannot
 * reach inside, and these diagrams theme themselves from the site's own
 * data-theme tokens. Inlining keeps light/dark working. (The SVGs also carry
 * presentation attributes, so they still render correctly anywhere CSS is
 * unavailable — GitHub, an image pipeline, a PDF.)
 *
 * `source` and `facts` are not decoration. Every box, edge and card line in
 * these diagrams cites a file:line in the project's real source, and the
 * citations are machine-verified on every build. The links are how a reader
 * checks that claim instead of taking it on faith.
 */
export default function Diagram({ svg, caption, source, facts, repo = 'https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main' }) {
  return (
    <FadeIn>
      <figure className="diagram">
        <div className="diagram__frame" dangerouslySetInnerHTML={{ __html: svg }} />
        <figcaption className="diagram__caption">
          <span className="diagram__note">{caption}</span>
          <span className="diagram__links">
            {source && (
              <a href={`${repo}/${source}`} target="_blank" rel="noreferrer">source</a>
            )}
            {facts && (
              <a href={`${repo}/${facts}`} target="_blank" rel="noreferrer">every box cited →</a>
            )}
          </span>
        </figcaption>
      </figure>
    </FadeIn>
  );
}

/**
 * A label for the hand-drawn concept art that sits alongside a governed diagram.
 *
 * Why this exists: those illustrations contain zero identifiers from the real
 * codebase — they teach the general pattern. Unlabelled, next to a diagram of the
 * actual implementation, a reader cannot tell which one describes the system.
 * In 07-guardrails the concept art shows SIX layers while the code has THREE;
 * neither is wrong, but only one is a claim about this repo. This says which.
 */
export function ConceptNote({ children = 'Conceptual — the general pattern, not this codebase.' }) {
  return <p className="diagram__concept-note">{children}</p>;
}
