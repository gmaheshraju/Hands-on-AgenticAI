import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import FadeIn from '../../components/FadeIn';

const TABS = ['The FDE Model', 'Team Structure', 'FDE vs SaaS', 'The AI Playbook', 'In Practice'];

export default function ForwardDeployedEngineering() {
  const [tab, setTab] = useState(0);

  return (
    <div className="page-content">
      <Link to="/blog" style={styles.back}>&larr; AI Engineering</Link>
      <p style={styles.eyebrow}>Post 14</p>
      <h1 style={styles.h1}>Forward Deployed Engineering</h1>
      <p style={styles.subtitle}>
        The engineering model pioneered by Palantir that&rsquo;s reshaping how AI companies deliver value &mdash;
        embedded engineers, rapid prototyping, and the &ldquo;gravel road to paved highway&rdquo; playbook
        that turned non-scalable work into a competitive moat.
      </p>

      <div style={styles.tabWrap}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ ...styles.tabBtn, ...(tab === i ? styles.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {tab === 0 && <FDEModelPanel />}
      {tab === 1 && <TeamStructurePanel />}
      {tab === 2 && <FDEVsSaaSPanel />}
      {tab === 3 && <AIPlaybookPanel />}
      {tab === 4 && <AppliedPatternsPanel />}

      <FadeIn><div style={{ marginTop: 48, padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Capstone Project</p>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-h)', marginBottom: 6 }}>Customer Onboarding Toolkit</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Build the real thing. Production-grade project brief with architecture requirements, evaluation criteria, and deep dive exercises.</p>
        <a href="https://github.com/gmaheshraju/Hands-on-AgenticAI/blob/main/projects/14-forward-deployed-engineering.md" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text-accent)', textDecoration: 'none', fontWeight: 500 }}>View project brief on GitHub →</a>
      </div></FadeIn>
    </div>
  );
}

function SectionHead({ title, desc }) {
  return (
    <>
      <h2 style={styles.sh}>{title}</h2>
      <p style={styles.ss}>{desc}</p>
    </>
  );
}

/* ─── Tab 1: The FDE Model ─── */
function FDEModelPanel() {
  return (
    <div>
      <SectionHead
        title="What is a Forward Deployed Engineer?"
        desc="An FDE is a technically deep engineer embedded at customer sites who configures, customizes, and builds solutions for specific business needs. Not support. Not consulting. An engineer who ships production code in the customer's environment."
      />

      <FadeIn>
        <svg viewBox="0 0 760 320" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', marginBottom: 24, borderRadius: 'var(--radius-md)', background: 'var(--bg-code)', padding: 20 }}>
          <text x="380" y="24" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-mono)">THE FDE OPERATING MODEL</text>

          {/* Customer Site */}
          <rect x="20" y="50" width="340" height="240" rx="12" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1" strokeDasharray="6 3" />
          <text x="40" y="74" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)" letterSpacing="0.08em">CUSTOMER SITE</text>

          {/* FDE */}
          <rect x="50" y="100" width="130" height="60" rx="8" fill="var(--bg-accent)" stroke="var(--text-accent)" strokeWidth="1.5" />
          <text x="115" y="126" textAnchor="middle" fill="var(--text-accent)" fontSize="12" fontWeight="600" fontFamily="var(--font-display)">FDE</text>
          <text x="115" y="144" textAnchor="middle" fill="var(--text-p)" fontSize="10" fontFamily="var(--font-mono)">embedded eng</text>

          {/* Client Team */}
          <rect x="210" y="100" width="130" height="60" rx="8" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1" />
          <text x="275" y="126" textAnchor="middle" fill="var(--text-h)" fontSize="12" fontWeight="600" fontFamily="var(--font-display)">Client Team</text>
          <text x="275" y="144" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)">domain experts</text>

          {/* Arrow FDE -> Client */}
          <line x1="180" y1="130" x2="210" y2="130" stroke="var(--text-accent)" strokeWidth="1.5" markerEnd="url(#arrowFDE)" />

          {/* Prototype */}
          <rect x="50" y="190" width="290" height="50" rx="8" fill="var(--bg-code)" stroke="var(--border)" strokeWidth="1" />
          <text x="195" y="212" textAnchor="middle" fill="var(--text-h)" fontSize="11" fontWeight="600" fontFamily="var(--font-display)">Rapid Prototype</text>
          <text x="195" y="228" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)">&ldquo;rough and ready code&rdquo; &rarr; immediate value</text>

          {/* Arrows down */}
          <line x1="115" y1="160" x2="115" y2="190" stroke="var(--text-accent)" strokeWidth="1" strokeDasharray="4 3" />
          <line x1="275" y1="160" x2="275" y2="190" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 3" />

          {/* HQ / Product Side */}
          <rect x="400" y="50" width="340" height="240" rx="12" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1" />
          <text x="420" y="74" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)" letterSpacing="0.08em">PRODUCT HQ</text>

          {/* Feedback Loop */}
          <rect x="430" y="100" width="130" height="60" rx="8" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1" />
          <text x="495" y="126" textAnchor="middle" fill="var(--text-h)" fontSize="12" fontWeight="600" fontFamily="var(--font-display)">Product Team</text>
          <text x="495" y="144" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)">patterns &rarr; product</text>

          {/* Platform */}
          <rect x="590" y="100" width="130" height="60" rx="8" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1" />
          <text x="655" y="126" textAnchor="middle" fill="var(--text-h)" fontSize="12" fontWeight="600" fontFamily="var(--font-display)">Platform</text>
          <text x="655" y="144" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)">paved highway</text>

          {/* Arrow Product -> Platform */}
          <line x1="560" y1="130" x2="590" y2="130" stroke="var(--border)" strokeWidth="1.5" markerEnd="url(#arrowFDE)" />

          {/* Gravel Road */}
          <rect x="430" y="190" width="290" height="50" rx="8" fill="var(--bg-accent)" stroke="var(--text-accent)" strokeWidth="1" strokeDasharray="6 3" />
          <text x="575" y="212" textAnchor="middle" fill="var(--text-accent)" fontSize="11" fontWeight="600" fontFamily="var(--font-display)">Gravel &rarr; Paved Highway</text>
          <text x="575" y="228" textAnchor="middle" fill="var(--text-p)" fontSize="10" fontFamily="var(--font-mono)">custom solutions harden into product features</text>

          {/* Cross arrows */}
          <path d="M340 130 L400 130" stroke="var(--text-accent)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowFDE)" />
          <text x="370" y="122" textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)">feedback</text>

          <line x1="495" y1="160" x2="495" y2="190" stroke="var(--text-accent)" strokeWidth="1" strokeDasharray="4 3" />

          {/* Bottom label */}
          <text x="380" y="310" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)" fontStyle="italic">&ldquo;Doing things that don&apos;t scale, at scale&rdquo;</text>

          <defs>
            <marker id="arrowFDE" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0 0 L8 4 L0 8" fill="none" stroke="var(--text-accent)" strokeWidth="1.5" />
            </marker>
          </defs>
        </svg>
      </FadeIn>

      <FadeIn><Decision question="What makes FDE different from consulting or professional services?">
        <Pill type="green">FDEs ship code</Pill> Consultants write recommendations. Solutions engineers do demos. FDEs write production code in the customer&rsquo;s environment, solving real problems with real data. They own outcomes, not deliverables.
        <br /><br />
        <Pill type="amber">Product discovery, not delivery</Pill> The goal isn&rsquo;t to finish a project and leave. It&rsquo;s to discover what the product should become by building it at the edge with real users. Custom work feeds back into the platform.
        <br /><br />
        <Pill type="red">Not support</Pill> FDEs don&rsquo;t triage tickets. They&rsquo;re senior engineers who prototype, integrate, and solve problems that the product doesn&rsquo;t handle yet. They extend the product&rsquo;s capability surface.
      </Decision></FadeIn>

      <FadeIn>
        <Insight tag="Bob McGrew (ex-OpenAI Chief Research Officer)">
          &ldquo;Unlike traditional software engineers who create single capabilities for many customers, FDEs focus on enabling many capabilities for a single customer.&rdquo; This inverts the normal leverage equation &mdash; depth per account instead of breadth across accounts.
        </Insight>
      </FadeIn>

      <FadeIn><Decision question="When does a company need FDEs vs a self-serve product?">
        <Pill type="green">FDE-first</Pill> New market where nobody knows the right product shape yet. Complex enterprise domains (defense, healthcare, finance) where generic solutions fail. AI applications where the model needs domain-specific tuning per customer.
        <br /><br />
        <Pill type="amber">Hybrid</Pill> Product handles most use cases but the top-tier customers need deep customization. FDEs handle the long tail while feeding patterns back into the platform.
        <br /><br />
        <Pill type="red">Self-serve first</Pill> Well-understood domain. Clear product-market fit. High-volume, low-touch customers. FDEs here would be overpaying for something the product should just do.
      </Decision></FadeIn>

      <FadeIn>
        <Insight type="warn" tag="The gravel road trap">
          The biggest risk is staying on gravel forever. If custom solutions never harden into product features, you&rsquo;re running an expensive consulting firm. The FDE model only works when there&rsquo;s a paved-highway team absorbing patterns and productizing them.
        </Insight>
      </FadeIn>
    </div>
  );
}

/* ─── Tab 2: Team Structure ─── */
function TeamStructurePanel() {
  return (
    <div>
      <SectionHead
        title="Echo and Anthropic teams"
        desc="Palantir's FDE model runs on two complementary team types &mdash; like a miniature startup embedded inside each customer."
      />

      <FadeIn>
        <svg viewBox="0 0 760 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', marginBottom: 24, borderRadius: 'var(--radius-md)', background: 'var(--bg-code)', padding: 20 }}>
          <text x="380" y="24" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-mono)">ECHO + ANTHROPIC TEAM MODEL</text>

          {/* Echo Team */}
          <rect x="30" y="50" width="330" height="200" rx="12" fill="var(--bg-card)" stroke="var(--text-accent)" strokeWidth="1.5" />
          <text x="195" y="74" textAnchor="middle" fill="var(--text-accent)" fontSize="13" fontWeight="600" fontFamily="var(--font-display)">Echo Team</text>
          <text x="195" y="92" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)">domain experts &bull; &ldquo;heretics&rdquo;</text>

          <text x="50" y="120" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; Deep domain knowledge from client&rsquo;s field</text>
          <text x="50" y="140" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; Former practitioners (military, healthcare, finance)</text>
          <text x="50" y="160" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; Account management + product discovery</text>
          <text x="50" y="180" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; Communicate with users to find core problems</text>
          <text x="50" y="200" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; Rebels who know what&rsquo;s broken in the status quo</text>

          <rect x="50" y="218" width="290" height="22" rx="4" fill="var(--bg-accent)" />
          <text x="195" y="233" textAnchor="middle" fill="var(--text-accent)" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">IDENTIFIES WHERE VALUE LIVES</text>

          {/* Anthropic Team */}
          <rect x="400" y="50" width="330" height="200" rx="12" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1.5" />
          <text x="565" y="74" textAnchor="middle" fill="var(--text-h)" fontSize="13" fontWeight="600" fontFamily="var(--font-display)">Anthropic Team</text>
          <text x="565" y="92" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)">rapid prototypers &bull; &ldquo;pain eaters&rdquo;</text>

          <text x="420" y="120" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; Highly efficient software engineers</text>
          <text x="420" y="140" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; &ldquo;Doers&rdquo; not &ldquo;artisans&rdquo; &mdash; speed over perfection</text>
          <text x="420" y="160" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; Turn Echo needs into functional solutions</text>
          <text x="420" y="180" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; Deliver under imperfect conditions</text>
          <text x="420" y="200" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-body)">&#8227; Accustomed to &ldquo;eating a lot of pain&rdquo;</text>

          <rect x="420" y="218" width="290" height="22" rx="4" fill="var(--bg-code)" />
          <text x="565" y="233" textAnchor="middle" fill="var(--text-h)" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">BUILDS IT FAST, SHIPS IT NOW</text>

          {/* Connecting arrow */}
          <line x1="360" y1="150" x2="400" y2="150" stroke="var(--text-accent)" strokeWidth="1.5" markerEnd="url(#arrowED)" />
          <line x1="400" y1="150" x2="360" y2="150" stroke="var(--border)" strokeWidth="1.5" markerEnd="url(#arrowEDr)" />
          <text x="380" y="142" textAnchor="middle" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">collab</text>

          <defs>
            <marker id="arrowED" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0 0 L8 4 L0 8" fill="none" stroke="var(--text-accent)" strokeWidth="1.5" />
            </marker>
            <marker id="arrowEDr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0 0 L8 4 L0 8" fill="none" stroke="var(--border)" strokeWidth="1.5" />
            </marker>
          </defs>
        </svg>
      </FadeIn>

      <FadeIn><Decision question="How do Echo and Anthropic teams collaborate?">
        <Pill type="green">Echo finds the problem</Pill> Echo team members have lived the client&rsquo;s reality. A former military intelligence officer knows exactly which analyst workflows are broken. A former hospital administrator knows which patient data flows are manual. They&rsquo;re hired because they&rsquo;re domain rebels &mdash; people who see what&rsquo;s broken and believe technology can fix it.
        <br /><br />
        <Pill type="amber">Anthropic builds the solution</Pill> Anthropic engineers take Echo&rsquo;s insights and build functional prototypes fast. Not beautiful code &mdash; working code. A demo in days, not months. The prototype proves value to the executive sponsor, which funds deeper engagement.
        <br /><br />
        <Pill type="green">Together: a startup inside the customer</Pill> Echo handles the &ldquo;what&rdquo; and &ldquo;why.&rdquo; Anthropic handles the &ldquo;how&rdquo; and &ldquo;when.&rdquo; Initial results arrive within months, not the multi-year timelines of traditional enterprise software.
      </Decision></FadeIn>

      <FadeIn>
        <Insight tag="Staff+ signal">
          Reference this model when discussing how to structure customer-engineering teams. The Echo/Anthropic split is a concrete alternative to &ldquo;we assign a solutions engineer.&rdquo; It shows you understand that domain discovery and rapid engineering are different skills that work best as separate, paired roles.
        </Insight>
      </FadeIn>

      <FadeIn><Decision question="What makes a great FDE hire?">
        <Pill type="green">For Echo roles</Pill> Former practitioners from the target domain who are technically curious. Ex-military intelligence analysts. Healthcare data scientists. Financial compliance officers. They must be &ldquo;heretics&rdquo; &mdash; people who are frustrated with the status quo and believe in technology-driven change.
        <br /><br />
        <Pill type="green">For Anthropic roles</Pill> Strong engineers who thrive in ambiguity. They write working code fast, not perfect code slowly. Comfortable with imperfect requirements, shifting priorities, and demo-driven development. High pain tolerance for messy customer environments.
        <br /><br />
        <Pill type="red">Anti-pattern</Pill> Engineers who optimize for code quality over speed. Someone who wants a clear spec before writing line one won&rsquo;t survive the FDE environment. Also: engineers who can&rsquo;t communicate with non-technical stakeholders.
      </Decision></FadeIn>

      <FadeIn>
        <Insight type="warn" tag="Hiring trap">
          FDE roles attract senior engineers who want customer-facing work, but many underestimate the &ldquo;pain-eating&rdquo; aspect. Working in a customer&rsquo;s legacy infrastructure, with incomplete data, on a changing problem &mdash; this breaks engineers who need clean environments. Screen for resilience, not just skill.
        </Insight>
      </FadeIn>
    </div>
  );
}

/* ─── Tab 3: FDE vs SaaS ─── */
function FDEVsSaaSPanel() {
  return (
    <div>
      <SectionHead
        title="FDE vs traditional SaaS"
        desc="Two fundamentally different go-to-market motions. Not better or worse &mdash; different tools for different market conditions."
      />

      <FadeIn>
        <svg viewBox="0 0 760 250" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', marginBottom: 24, borderRadius: 'var(--radius-md)', background: 'var(--bg-code)', padding: 20 }}>
          <text x="380" y="24" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-mono)">FDE vs SaaS: WHEN TO USE WHICH</text>

          {/* FDE Column */}
          <rect x="30" y="45" width="330" height="180" rx="12" fill="var(--bg-card)" stroke="var(--text-accent)" strokeWidth="1.5" />
          <text x="195" y="68" textAnchor="middle" fill="var(--text-accent)" fontSize="13" fontWeight="600" fontFamily="var(--font-display)">Forward Deployed</text>

          <text x="50" y="96" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.06em">APPROACH</text>
          <text x="50" y="112" fill="var(--text-p)" fontSize="11">Services-first, deeply customized per client</text>

          <text x="50" y="134" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.06em">SALES</text>
          <text x="50" y="150" fill="var(--text-p)" fontSize="11">Top-down to executives, demo-driven</text>

          <text x="50" y="172" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.06em">BEST FOR</text>
          <text x="50" y="188" fill="var(--text-p)" fontSize="11">Complex AI, defense, healthcare, new markets</text>

          <text x="50" y="210" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.06em">MOAT</text>
          <text x="195" y="210" fill="var(--text-accent)" fontSize="11" fontWeight="600" textAnchor="middle">Deep customer lock-in + domain data</text>

          {/* SaaS Column */}
          <rect x="400" y="45" width="330" height="180" rx="12" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1.5" />
          <text x="565" y="68" textAnchor="middle" fill="var(--text-h)" fontSize="13" fontWeight="600" fontFamily="var(--font-display)">Traditional SaaS</text>

          <text x="420" y="96" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.06em">APPROACH</text>
          <text x="420" y="112" fill="var(--text-p)" fontSize="11">Product-first, standardized solution</text>

          <text x="420" y="134" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.06em">SALES</text>
          <text x="420" y="150" fill="var(--text-p)" fontSize="11">Product-led growth, self-service onboarding</text>

          <text x="420" y="172" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.06em">BEST FOR</text>
          <text x="420" y="188" fill="var(--text-p)" fontSize="11">Known problems, horizontal tools, SMB/mid-market</text>

          <text x="420" y="210" fill="var(--text-muted)" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.06em">MOAT</text>
          <text x="565" y="210" fill="var(--text-h)" fontSize="11" fontWeight="600" textAnchor="middle">Network effects + switching costs</text>
        </svg>
      </FadeIn>

      <FadeIn><Decision question="Services-first or product-first for an AI startup?">
        <Pill type="green">FDE-first (most AI startups)</Pill> If your AI product needs to capture complex business logic, handle domain-specific edge cases, or integrate with messy enterprise data &mdash; start with FDEs. You don&rsquo;t yet know what the product should look like. Let FDEs discover it.
        <br /><br />
        <Pill type="amber">Product-first (clear PMF)</Pill> If the problem is well-understood and the solution is standardized (think: email marketing, project management, basic chatbots), skip FDEs. Build the product, ship it, iterate from usage data.
        <br /><br />
        <Pill type="green">The Palantir playbook</Pill> Start FDE-first to win design partners and learn the domain. As patterns emerge across customers, productize them. Gradually shift the ratio from mostly custom to mostly product. This is the &ldquo;gravel road to paved highway&rdquo; transition.
      </Decision></FadeIn>

      <FadeIn>
        <Insight tag="Staff+ signal">
          The key metric in the FDE model: &ldquo;product leverage.&rdquo; Track how much more value each FDE can deliver as the platform matures. Early on, an FDE builds everything from scratch. As the platform absorbs patterns, the same FDE delivers dramatically more by configuring instead of coding. If leverage isn&rsquo;t growing, you&rsquo;re stuck on gravel.
        </Insight>
      </FadeIn>

      <FadeIn><Decision question="How do you measure FDE success?">
        <Pill type="green">Product leverage growth</Pill> The core metric. How much more can each FDE deliver as the platform matures? Each new customer engagement should be faster than the last because patterns are now in the product. If delivery time isn&rsquo;t shrinking, leverage isn&rsquo;t working.
        <br /><br />
        <Pill type="amber">Contract value expansion</Pill> Healthy FDE engagements grow. First contract: solve one problem. Second: solve three more. Shrinking contract value means the FDE isn&rsquo;t demonstrating enough value, or the customer is pulling the work in-house.
        <br /><br />
        <Pill type="amber">Time to initial value</Pill> FDEs should deliver a working prototype within weeks, not months. If it takes 6 months to show anything, the model isn&rsquo;t working &mdash; either the FDE isn&rsquo;t empowered, or the problem is wrong for this approach.
        <br /><br />
        <Pill type="green">Scalability transition rate</Pill> What percentage of custom solutions become product features? This is the ultimate measure of whether the gravel-to-highway pipeline is functioning. If very few custom patterns are making it into the product, the feedback loop is broken.
      </Decision></FadeIn>

      <FadeIn>
        <Insight type="warn" tag="The margin trap">
          FDE teams look like a cost center on the P&amp;L. Services revenue has lower margins than software revenue. The CFO will always push to &ldquo;reduce FDE headcount.&rdquo; The counter-argument: FDEs are R&amp;D disguised as services. They&rsquo;re doing product discovery with real customers at real scale. Cutting them cuts your product roadmap&rsquo;s source of truth.
        </Insight>
      </FadeIn>
    </div>
  );
}

/* ─── Tab 4: The AI Playbook ─── */
function AIPlaybookPanel() {
  return (
    <div>
      <SectionHead
        title="Why AI makes FDEs essential"
        desc="AI products fail generic. Every enterprise has unique data, workflows, and edge cases that off-the-shelf AI can't handle. FDEs bridge the gap between 'AI demo' and 'AI in production.'"
      />

      <FadeIn><Decision question="Why can't AI startups just ship a product and iterate?">
        <Pill type="green">AI is context-dependent</Pill> A chatbot trained on general data hallucinates on your customer&rsquo;s domain. A document extraction model tuned for legal contracts fails on medical records. AI products need domain adaptation, and that requires someone inside the customer&rsquo;s environment understanding their data.
        <br /><br />
        <Pill type="amber">Integration is the hard part</Pill> The AI model is the easy part. The real work: connecting to legacy systems, handling dirty data, building trust with end users, navigating compliance requirements. This is FDE work &mdash; it can&rsquo;t be done from HQ.
        <br /><br />
        <Pill type="red">The demo-to-production gap</Pill> Every AI startup can build a compelling demo. Very few can make it work in production with real customer data, real edge cases, and real regulatory constraints. FDEs close this gap by being physically present and technically capable.
      </Decision></FadeIn>

      <FadeIn>
        <Insight tag="Staff+ signal">
          In any system design for AI companies, always address the deployment model. &ldquo;How does this AI system actually get into the customer&rsquo;s hands?&rdquo; is a question most engineers skip. Bringing up FDE as a deployment strategy &mdash; especially for enterprise AI &mdash; signals that you think beyond the model architecture.
        </Insight>
      </FadeIn>

      <FadeIn><Decision question="What does an AI-era FDE actually do day-to-day?">
        <Pill type="green">Data pipeline engineering</Pill> Connect the AI system to the customer&rsquo;s data sources. ETL from legacy databases, real-time feeds, document stores. Build the RAG pipeline against their actual documents, not sample data.
        <br /><br />
        <Pill type="green">Model adaptation</Pill> Prompt engineering for the customer&rsquo;s domain. Fine-tuning on their data. Building evaluation sets from their real use cases. Setting up feedback loops so the model improves from actual usage.
        <br /><br />
        <Pill type="amber">Integration and workflow design</Pill> Embedding the AI into existing workflows. Not &ldquo;here&rsquo;s a new tool&rdquo; but &ldquo;your existing tool now has AI capabilities.&rdquo; This requires understanding the customer&rsquo;s daily operations deeply.
        <br /><br />
        <Pill type="amber">Trust building</Pill> Running pilots. Showing end users that the AI gets it right. Building confidence UX (confidence scores, explainability, human-in-the-loop flows). This is where domain knowledge meets engineering.
      </Decision></FadeIn>

      <FadeIn>
        <Insight tag="The Palantir lesson">
          Palantir started in counter-terrorism intelligence. No amount of product-led growth would have worked. The data was classified, the workflows were classified, the edge cases were life-or-death. FDEs with security clearances, embedded in intelligence agencies, building custom solutions &mdash; that was the only viable path. AI startups in healthcare, defense, and finance face the same dynamic today.
        </Insight>
      </FadeIn>

      <FadeIn><Decision question="How do AI FDE learnings feed back into the product?">
        <Pill type="green">Pattern extraction</Pill> FDE at Customer A builds a custom document extraction pipeline. FDE at Customer B builds something similar but different. Product team identifies the common core and builds it into the platform. Now FDEs only build the customer-specific pieces.
        <br /><br />
        <Pill type="amber">Eval set pooling</Pill> Each FDE engagement produces real-world evaluation data. Aggregate (with appropriate data handling) across customers to build robust benchmarks that improve the base model for everyone.
        <br /><br />
        <Pill type="green">Failure mode catalog</Pill> FDEs discover how AI breaks in production: hallucinations on specific data types, latency spikes on certain query patterns, compliance issues in regulated domains. This becomes the product team&rsquo;s reliability roadmap.
      </Decision></FadeIn>

      <FadeIn>
        <Insight type="warn" tag="Data gravity warning">
          Once an FDE deeply integrates an AI system with a customer&rsquo;s data, switching costs become enormous. This is intentional &mdash; it&rsquo;s the moat. But it also means you must deliver real value, not just create lock-in through complexity. Customers who feel trapped become hostile; customers who feel empowered expand.
        </Insight>
      </FadeIn>
    </div>
  );
}

/* ─── Tab 5: In Practice ─── */
function AppliedPatternsPanel() {
  return (
    <div>
      <SectionHead
        title="FDE design questions and frameworks"
        desc="How to apply FDE knowledge in system design, organizational design, and go-to-market decisions. These concepts show up in every enterprise AI architecture conversation."
      />

      <FadeIn><Decision question="System design: 'Design an AI system for enterprise document processing'">
        <Pill type="green">Bring up FDE deployment</Pill> &ldquo;For enterprise document processing, I&rsquo;d recommend an FDE-first deployment. The reason: every enterprise has different document formats, compliance requirements, and integration points. An FDE embedded at the customer site builds the initial pipeline against real data, identifies edge cases, and creates the evaluation set from actual documents.&rdquo;
        <br /><br />
        <Pill type="amber">Address the scaling path</Pill> &ldquo;As we onboard customers, FDEs will discover common patterns &mdash; similar document types, similar extraction needs. We productize those into the platform. The metric I&rsquo;d track is product leverage: how much faster can FDE #10 deliver versus FDE #1? If it&rsquo;s not significantly faster, our gravel-to-highway pipeline is broken.&rdquo;
        <br /><br />
        <Pill type="green">Show you understand unit economics</Pill> &ldquo;FDE cost is high per customer, but it&rsquo;s actually R&amp;D spend disguised as services. Each engagement teaches us what the product should become. The investment pays off when product leverage means one FDE can serve five accounts instead of one.&rdquo;
      </Decision></FadeIn>

      <FadeIn>
        <Insight tag="Staff+ signal">
          Most candidates design the system architecture but ignore deployment. FDE knowledge lets you address the full lifecycle: how does this AI system actually get to customers, integrate with their data, and improve over time? This is the gap between senior and staff-level thinking.
        </Insight>
      </FadeIn>

      <FadeIn><Decision question="Org design: 'How would you structure an AI engineering team?'">
        <Pill type="green">Reference Echo/Anthropic</Pill> &ldquo;I&rsquo;d consider Palantir&rsquo;s Echo/Anthropic model. Echo team members are domain experts from the customer&rsquo;s field &mdash; they know what problems are worth solving. Anthropic engineers are rapid prototypers who build working solutions fast. Together they operate like a mini startup inside the customer.&rdquo;
        <br /><br />
        <Pill type="amber">Address the feedback loop</Pill> &ldquo;Critical: there must be a product team back at HQ whose job is to absorb patterns from FDE engagements. Without this, you&rsquo;re running a consulting firm. With it, every customer engagement makes the product better for all customers.&rdquo;
        <br /><br />
        <Pill type="green">Success metrics</Pill> &ldquo;I&rsquo;d measure three things: time-to-initial-value (weeks, not months), product leverage growth (FDE efficiency per engagement), and scalability transition rate (what percentage of custom work becomes product features).&rdquo;
      </Decision></FadeIn>

      <FadeIn><Decision question="Go-to-market: 'Should we build a self-serve AI product or go enterprise?'">
        <Pill type="green">Frame it as a spectrum</Pill> &ldquo;It depends on how well we understand the problem space. If we&rsquo;re entering a domain where we don&rsquo;t yet know what the product should look like &mdash; healthcare AI, legal AI, defense AI &mdash; FDE-first is the right call. We need to discover the product at the customer site.&rdquo;
        <br /><br />
        <Pill type="amber">The evolution path</Pill> &ldquo;Most successful AI companies start FDE-heavy and gradually shift to product-heavy. Palantir pioneered this. The ratio should evolve over time &mdash; early on it&rsquo;s almost all custom work, and over the years the product absorbs more and more of what FDEs used to build by hand. If the ratio isn&rsquo;t shifting, something is wrong with the productization pipeline.&rdquo;
        <br /><br />
        <Pill type="red">Red flag answer</Pill> &ldquo;We&rsquo;ll just build the product and iterate based on usage data.&rdquo; This works for consumer apps. For enterprise AI, you need someone in the room with the customer&rsquo;s data to understand why the model fails on their specific cases.
      </Decision></FadeIn>

      <FadeIn>
        <Insight tag="Career move">
          FDE roles at AI companies (Palantir, Scale AI, Anduril, Ramp) pay $125K-$431K and are one of the fastest paths to senior technical leadership. You learn customer-facing skills, domain expertise, and rapid engineering simultaneously. If you&rsquo;re a strong engineer who finds pure backend work unfulfilling, FDE might be your lane.
        </Insight>
      </FadeIn>

      <FadeIn><Decision question="Key vocabulary to use in design discussions">
        <Pill type="green">&ldquo;Gravel road to paved highway&rdquo;</Pill> The progression from custom FDE solutions to productized features. Shows you understand the full lifecycle.
        <br /><br />
        <Pill type="green">&ldquo;Product leverage&rdquo;</Pill> How much more value each FDE delivers as the platform matures. The metric that proves the model is working.
        <br /><br />
        <Pill type="green">&ldquo;Doing things that don&rsquo;t scale, at scale&rdquo;</Pill> The FDE philosophy. Non-scalable, deeply customized work &mdash; but systematized across many customers.
        <br /><br />
        <Pill type="amber">&ldquo;Demo-driven development&rdquo;</Pill> Build the demo first, then harden it. Opposite of spec-driven development. Optimizes for time-to-value.
        <br /><br />
        <Pill type="amber">&ldquo;Services-first, product-second&rdquo;</Pill> Start by solving the customer&rsquo;s problem however you can. Let the product emerge from patterns across engagements.
      </Decision></FadeIn>

      <FadeIn>
        <Insight type="warn" tag="Don&rsquo;t oversell">
          FDE is not a silver bullet. It&rsquo;s expensive, hard to hire for, and creates organizational complexity. Use it when the market demands it (new domains, complex AI, enterprise) &mdash; not because it sounds sophisticated. In practice, showing when NOT to use FDE is as important as knowing when to use it.
        </Insight>
      </FadeIn>
        </div>
  );
}

const styles = {
  back: { fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'var(--font-mono)' },
  eyebrow: { fontSize: 11, fontWeight: 500, color: 'var(--text-accent)', letterSpacing: '0.08em', marginBottom: 8, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' },
  h1: { fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 400, color: 'var(--text-h)', lineHeight: 1.12, marginBottom: 16, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.75, marginBottom: 32 },
  tabWrap: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 28, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', paddingBottom: 12 },
  tabBtn: { fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', padding: '6px 14px', borderRadius: 'var(--radius-full)', cursor: 'pointer', transition: 'all var(--dur) var(--ease)', fontFamily: 'var(--font-body)' },
  tabActive: { color: 'var(--text-accent)', background: 'var(--bg-accent)' },
  sh: { fontSize: 20, fontWeight: 600, color: 'var(--text-h)', marginBottom: 8, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' },
  ss: { fontSize: 14, color: 'var(--text-p)', lineHeight: 1.7, marginBottom: 20 },
};
