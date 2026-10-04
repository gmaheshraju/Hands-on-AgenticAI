import { Link } from 'react-router-dom';
import FrameworkCard from '../components/FrameworkCard';
import FadeIn from '../components/FadeIn';
import { frameworks } from '../data/frameworks';

export default function Home() {
  return (
    <div>
      <section className="home-hero">
        <p className="home-hero__eyebrow rise" style={{ '--i': 0 }}>System Design</p>
        <h1 className="home-hero__title rise" style={{ '--i': 1 }}>
          System Design<br />
          <em className="swash">
            Playbook
            <svg className="swash__line" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
              <path d="M3 8.5 C 48 3, 118 2.5, 197 6.5" />
            </svg>
          </em>
        </h1>
        <p className="home-hero__tagline rise" style={{ '--i': 2 }}>
          {frameworks.length} decision frameworks for the backend questions that decide whether a system
          holds up: storage, caching, queues, consistency, failure. Each one starts from the constraint,
          not the technology.
        </p>
        <div className="hero-actions rise" style={{ '--i': 3, marginBottom: 0 }}>
          <Link to={frameworks[0].to} className="btn btn--primary">
            Start with {frameworks[0].title} <span className="btn__arrow" aria-hidden="true">&rarr;</span>
          </Link>
          <Link to="/" className="btn btn--ghost">Agentic AI Playbook</Link>
        </div>
      </section>

      <section style={{ marginBottom: '3.5rem' }}>
        <h2 className="home-section-title">Frameworks</h2>
        <div className="post-grid">
          {frameworks.map((f, index) => (
            <FadeIn key={f.number} delay={(index % 4) * 40} className="post-grid__cell">
              <FrameworkCard {...f} />
            </FadeIn>
          ))}
        </div>
      </section>

      <section className="home-philosophy">
        <div className="home-philosophy__bar" />
        <div>
          <h2 className="home-philosophy__title">The meta-principle</h2>
          <p className="home-philosophy__text">
            Every weak system design answer starts with a technology name.
            Every strong one starts with a constraint: the query shape, the scale,
            the consistency requirement, the write pattern.
            The technology is the last word in the sentence, never the first.
          </p>
          <p className="home-philosophy__sub">
            These frameworks train you to think constraint-first. That is what separates
            a 30L offer from a 2Cr one: not more knowledge, but better judgment.
          </p>
        </div>
      </section>
    </div>
  );
}
