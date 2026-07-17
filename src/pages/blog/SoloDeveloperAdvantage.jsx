import { useState } from 'react';
import { Link } from 'react-router-dom';
import Decision, { Pill } from '../../components/Decision';
import Insight from '../../components/Insight';
import FadeIn from '../../components/FadeIn';

const tabs = [
  { key: 'thesis', label: 'The Thesis' },
  { key: 'playbook', label: 'The Playbook' },
  { key: 'moats', label: 'New Moats' },
  { key: 'examples', label: 'Patterns That Win' },
  { key: 'applied', label: 'Applied Patterns' },
];

export default function SoloDeveloperAdvantage() {
  const [active, setActive] = useState('thesis');
  return (
    <article style={styles.article}>
      <header style={styles.header}>
        <p style={styles.eyebrow}>AI Engineering Playbook — 16</p>
        <h1 style={styles.h1}>The Solo Developer Advantage</h1>
        <p style={styles.subtitle}>
          Why one developer with AI beats a team of twenty — and how engineers from anywhere in the world
          are building products that compete with giants.
        </p>
      </header>

      <nav style={styles.tabBar}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            style={active === t.key ? { ...styles.tab, ...styles.tabActive } : styles.tab}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section style={styles.body}>
        {active === 'thesis' && <Thesis />}
        {active === 'playbook' && <Playbook />}
        {active === 'moats' && <NewMoats />}
        {active === 'examples' && <Patterns />}
        {active === 'applied' && <AppliedPatterns />}
      </section>
    </article>
  );
}

/* ─── Tab: The Thesis ─── */
function Thesis() {
  return (
    <>
      <FadeIn delay={0}>
        <h2 style={styles.h2}>The Great Equalizer</h2>
        <p style={styles.p}>
          For decades, software was a game of resources. Building a competitive product required a team of specialists —
          frontend, backend, DevOps, QA, design, product management. A solo developer in Hyderabad or Lagos or São Paulo
          couldn't compete with a 200-person engineering org in San Francisco. The moat was <strong>headcount</strong>.
        </p>
        <p style={styles.p}>
          AI changed the equation. Not gradually — overnight. The minimum viable team collapsed from 10-15 people to 1-4.
          A single developer with AI coding assistants, cloud infrastructure, and domain expertise can now ship products
          that would have required a full company two years ago.
        </p>
      </FadeIn>

      <FadeIn delay={60}>
        <div style={styles.diagram}>
          <svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 700 }}>
            {/* 2022 side */}
            <rect x="20" y="20" width="300" height="280" rx="12" fill="var(--bg-code)" stroke="var(--border)" strokeWidth="1.5" />
            <text x="170" y="52" textAnchor="middle" fill="var(--text-h)" fontSize="14" fontWeight="700" fontFamily="var(--font-display)">2022: Building a SaaS Product</text>
            {['Frontend Dev ($120K)', 'Backend Dev ($140K)', 'DevOps ($130K)', 'Designer ($110K)', 'PM ($130K)', 'QA Engineer ($100K)', 'Data Engineer ($135K)', 'Security ($140K)'].map((role, i) => (
              <g key={role}>
                <rect x="40" y={68 + i * 28} width="260" height="22" rx="4" fill="var(--bg-accent-subtle)" />
                <text x="170" y={83 + i * 28} textAnchor="middle" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-mono)">{role}</text>
              </g>
            ))}
            <text x="170" y="306" textAnchor="middle" fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-mono)">~$1M/year · 6-month MVP</text>

            {/* Arrow */}
            <path d="M340 160 L360 160" stroke="var(--text-muted)" strokeWidth="2" markerEnd="url(#arrowhead)" />
            <defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="var(--text-muted)" /></marker></defs>

            {/* 2026 side */}
            <rect x="380" y="20" width="300" height="280" rx="12" fill="var(--bg-code)" stroke="var(--text-accent)" strokeWidth="2" />
            <text x="530" y="52" textAnchor="middle" fill="var(--text-h)" fontSize="14" fontWeight="700" fontFamily="var(--font-display)">2026: Same Product</text>
            <rect x="400" y="72" width="260" height="40" rx="8" fill="var(--bg-accent-subtle)" />
            <text x="530" y="96" textAnchor="middle" fill="var(--text-accent)" fontSize="13" fontWeight="600" fontFamily="var(--font-display)">You (Domain Expert)</text>
            {['AI Coding Assistant', 'AI Code Review & QA', 'AI DevOps & Infra', 'AI Design & Copy', 'Cloud Platform ($20/mo)'].map((tool, i) => (
              <g key={tool}>
                <rect x="400" y={124 + i * 30} width="260" height="24" rx="4" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="1" />
                <text x="530" y={140 + i * 30} textAnchor="middle" fill="var(--text-p)" fontSize="11" fontFamily="var(--font-mono)">{tool}</text>
              </g>
            ))}
            <text x="530" y="306" textAnchor="middle" fill="var(--text-accent)" fontSize="11" fontWeight="600" fontFamily="var(--font-mono)">~$2K/year · 2-week MVP</text>
          </svg>
        </div>
      </FadeIn>

      <FadeIn delay={120}>
        <Insight tag="the shift">
          The bottleneck moved from <strong>"can we build it?"</strong> to <strong>"do we know what to build?"</strong> When
          AI handles the breadth of skills, the only thing that matters is the depth of your insight. A developer who deeply
          understands a problem space — and can direct AI to solve it — beats a team that's guessing at requirements.
        </Insight>
      </FadeIn>

      <FadeIn delay={180}>
        <h3 style={styles.h3}>Five Forces Working in Your Favor</h3>
        <div style={styles.forceGrid}>
          {[
            { num: '01', title: 'Infrastructure is free', desc: 'Cloudflare, Vercel, Supabase, Railway. Global deployment for $0-20/month. What cost $50K/month in 2018 costs nothing today.' },
            { num: '02', title: 'AI closes the skill gap', desc: 'Don\'t know React? AI writes it. Don\'t know DevOps? AI configures it. You no longer hire 8 specialties — you direct them through AI.' },
            { num: '03', title: 'Speed kills scale', desc: 'You ship a feature in 2 hours. A giant files a JIRA ticket, waits for sprint planning, 3 code reviews, legal review — 6 weeks. You\'ve iterated 30 times by then.' },
            { num: '04', title: 'Domain expertise can\'t be hired', desc: 'A developer who spent 10 years in Indian agriculture knows problems no Silicon Valley team can buy access to. AI + that knowledge = an un-copyable product.' },
            { num: '05', title: 'Niches are invisible to giants', desc: 'Big companies build for millions. They can\'t build for 500 farmers in Andhra Pradesh or 2000 physiotherapists in Pune. These niches are deeply profitable for one person.' },
          ].map(f => (
            <div key={f.num} style={styles.forceCard}>
              <span style={styles.forceNum}>{f.num}</span>
              <div>
                <strong style={styles.forceTitle}>{f.title}</strong>
                <p style={styles.forceDesc}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={240}>
        <Decision question="But doesn't AI make it easy for everyone? Where's the moat?">
          This is the most important question, and the answer is counterintuitive. Yes, AI makes building <em>easier</em> for
          everyone. But it doesn't make <strong>knowing what to build</strong> easier. The developer who has lived in a domain
          for years — who understands the workflows, the pain points, the regulatory quirks, the cultural context — has a moat
          that no amount of AI can replicate for a competitor who's just discovered the space.
          <br /><br />
          Put differently: AI commoditized <em>execution</em>. It made <em>taste</em> the scarce resource. The person who knows
          that Indian truck drivers need SMS-based load matching (not a fancy app) has a moat. The YC startup building "Uber for
          trucking in India" with a beautiful React Native app does not.
        </Decision>
      </FadeIn>
    </>
  );
}

/* ─── Tab: The Playbook ─── */
function Playbook() {
  return (
    <>
      <FadeIn delay={0}>
        <h2 style={styles.h2}>The Solo Developer Playbook</h2>
        <p style={styles.p}>
          This isn't about working harder. It's about using AI to collapse the time between insight and shipped product.
          Here's the playbook that's working for developers around the world in 2026.
        </p>
      </FadeIn>

      <FadeIn delay={60}>
        <h3 style={styles.h3}>Phase 1: Find Your Unfair Advantage</h3>
        <p style={styles.p}>
          Your unfair advantage is never technical — it's experiential. It comes from a domain you've lived in, not one
          you've researched. The best solo products come from developers solving their own problems, or problems they've
          watched others struggle with for years.
        </p>
        <div style={styles.contrastBox}>
          <div style={styles.contrastWeak}>
            <strong style={{ color: 'var(--text-h)' }}>Weak foundation</strong>
            <p style={styles.contrastText}>"I'll build an AI tool for healthcare because it's a big market"</p>
          </div>
          <div style={styles.contrastStrong}>
            <strong style={{ color: 'var(--text-h)' }}>Strong foundation</strong>
            <p style={styles.contrastText}>"My mother runs a clinic and spends 3 hours/day on insurance paperwork. I'll automate that specific workflow."</p>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={120}>
        <h3 style={styles.h3}>Phase 2: Build With AI as Your Team</h3>
        <p style={styles.p}>
          The mental model shift: you're not a developer writing code. You're a <strong>technical founder directing a team of AI
          specialists</strong>. Each AI tool is a team member with a specific role.
        </p>
        <div style={styles.roleGrid}>
          {[
            { role: 'AI Coding Assistant', does: 'Writes features, fixes bugs, refactors', human: 'Architecture decisions, what to build next' },
            { role: 'AI Code Reviewer', does: 'Catches bugs, security issues, style', human: 'Whether the feature solves the right problem' },
            { role: 'AI DevOps', does: 'CI/CD, Docker, deployment configs', human: 'Infrastructure cost decisions, scaling strategy' },
            { role: 'AI QA', does: 'Generates tests, edge cases, load scenarios', human: 'What "working" means for your users' },
            { role: 'AI Writer', does: 'Docs, marketing copy, support responses', human: 'Brand voice, what resonates with your audience' },
          ].map(r => (
            <div key={r.role} style={styles.roleCard}>
              <div style={styles.roleHeader}>{r.role}</div>
              <div style={styles.roleBody}>
                <div><span style={styles.roleLabel}>AI does:</span> {r.does}</div>
                <div><span style={styles.roleLabel}>You do:</span> {r.human}</div>
              </div>
            </div>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={180}>
        <Insight tag="the leverage ratio">
          The best solo developers aren't the best <em>coders</em>. They're the best <em>directors</em>. They write clear
          specifications, review AI output with domain expertise, and make judgment calls that no AI can make — "will my users
          actually want this?" That's the skill that scales. If you're spending more than 30% of your time writing code by hand,
          you're not leveraging AI enough.
        </Insight>
      </FadeIn>

      <FadeIn delay={240}>
        <h3 style={styles.h3}>Phase 3: Ship Fast, Listen Faster</h3>
        <p style={styles.p}>
          The solo developer's superpower isn't just speed — it's <strong>feedback loop compression</strong>. A feature goes
          from idea to production in hours, not weeks. But the real advantage is what happens after: you talk directly to users,
          see exactly how they use it, and iterate the same day. No product managers translating. No sprint ceremonies delaying.
          No committee diluting the insight.
        </p>
        <Decision question="How do you handle the parts of a business that aren't coding?">
          This is where most technical founders struggle, and where AI has made the biggest practical difference. Legal documents?
          AI drafts them, a lawyer reviews for a fraction of the cost. Accounting? AI categorizes transactions, you review monthly.
          Customer support? AI handles tier-1 with your knowledge base, you handle the complex cases that actually teach you something.
          Marketing? AI generates content variations, you pick what matches your voice.
          <br /><br />
          The pattern is always the same: <strong>AI proposes, you approve</strong>. You're not delegating blindly — you're reviewing
          with the expertise that comes from being close to every part of your business. A CEO of a 200-person company can't review
          every customer support ticket. You can, and that's an advantage.
        </Decision>
      </FadeIn>

      <FadeIn delay={300}>
        <h3 style={styles.h3}>Phase 4: Scale Revenue, Not Headcount</h3>
        <p style={styles.p}>
          The old playbook: raise money → hire people → grow revenue → hire more people. The new playbook: build alone → grow
          revenue → add AI automation → grow more revenue → maybe hire one person if you want to.
        </p>
        <p style={styles.p}>
          The metric that matters in 2026 isn't ARR or team size. It's <strong>revenue per employee</strong>. Midjourney reportedly
          generates ~$200M in revenue with ~40 employees — roughly $5M per person. Compare that to traditional tech's $500K per
          employee. The best solo developers are pushing this ratio even further.
        </p>
      </FadeIn>
    </>
  );
}

/* ─── Tab: New Moats ─── */
function NewMoats() {
  return (
    <>
      <FadeIn delay={0}>
        <h2 style={styles.h2}>The New Moats</h2>
        <p style={styles.p}>
          If AI commoditized execution, what's left to defend? The moats have shifted from technical barriers to
          human ones — and they're actually <em>stronger</em> for solo developers than for big companies.
        </p>
      </FadeIn>

      <FadeIn delay={60}>
        <Decision question="1. Domain depth — the 10,000-hour moat">
          A developer who has spent years in a specific industry — education in rural India, logistics in Southeast Asia,
          agriculture in sub-Saharan Africa — has accumulated knowledge that can't be replicated by a well-funded startup
          doing 2 weeks of "customer discovery." They know which regulations actually get enforced. They know which workflows
          people say they want automated vs. which ones they'll actually adopt. They know the WhatsApp group where the real
          decisions happen.
          <br /><br />
          This moat gets <em>wider</em> with AI, not narrower. AI lets you act on every insight instantly. The more you know,
          the more you can direct AI to build. The gap between "knows the domain" and "doesn't know the domain" used to be
          about building speed. Now it's about building the <em>right thing</em>.
        </Decision>
      </FadeIn>

      <FadeIn delay={120}>
        <Decision question="2. Trust and relationships — the human moat">
          Software is increasingly sold through trust, not features. A solo developer who is active in their community — answering
          questions, sharing insights, building in public — accumulates trust that no marketing budget can buy. When someone in a
          Telegram group for Indian stock traders says "I use this tool and it works," that's worth more than a $10M ad campaign.
          <br /><br />
          Big companies can't do this. They can't have their CEO personally respond to a user's WhatsApp message at 10 PM. You can.
          And in many markets — especially emerging ones — that personal connection is the entire buying decision.
        </Decision>
      </FadeIn>

      <FadeIn delay={180}>
        <Decision question="3. Speed of iteration — the compound interest moat">
          Every day you ship, you learn. Every day a competitor sits in sprint planning, they don't. Over a year, a solo developer
          who ships daily has made ~250 informed iterations. A team that ships biweekly has made ~25. That's a 10x learning advantage,
          and it compounds. By month six, you've explored corners of the problem space that your competitor doesn't even know exist.
          <br /><br />
          This is why solo developers often build products that feel "weirdly specific and perfect" — they've iterated so many times
          that every feature reflects a real user need, not a PM's hypothesis.
        </Decision>
      </FadeIn>

      <FadeIn delay={240}>
        <Decision question="4. Cost structure — the pricing moat">
          Your marginal cost is close to zero. No salaries, no office, no benefits, no middle management. You can price a product
          at $10/month that a VC-funded startup needs to charge $99/month to hit their revenue targets. In price-sensitive markets —
          which is most of the world — this is an unbeatable advantage.
          <br /><br />
          And here's the kicker: your $10/month product with 500 users generates $60K/year. That's life-changing money in most of
          the world, but it's a rounding error for a VC-funded company. They literally cannot compete in your niche because it's
          too small for their economics. Your niche is your fortress.
        </Decision>
      </FadeIn>

      <FadeIn delay={300}>
        <Insight tag="the geography advantage">
          For the first time in tech history, being <em>outside</em> Silicon Valley is an advantage, not a disadvantage. You
          understand markets that SF engineers don't. Your cost of living means $5K/month is financial freedom, not poverty.
          You have cultural context that can't be hired. The developer in Lagos who builds a tool for Nollywood producers, the
          developer in Jaipur who builds inventory management for textile merchants, the developer in Manila who builds scheduling
          for BPO shift workers — these aren't "emerging market plays." They're the future of software.
        </Insight>
      </FadeIn>
    </>
  );
}

/* ─── Tab: Patterns That Win ─── */
function Patterns() {
  return (
    <>
      <FadeIn delay={0}>
        <h2 style={styles.h2}>Patterns That Win</h2>
        <p style={styles.p}>
          These aren't hypothetical. These are the patterns producing real revenue for solo developers and
          tiny teams in 2026.
        </p>
      </FadeIn>

      <FadeIn delay={60}>
        <h3 style={styles.h3}>Pattern 1: Vertical AI SaaS</h3>
        <p style={styles.p}>
          Pick a specific profession. Build a tool that handles their most painful workflow. Use AI to make it feel
          magical. Charge monthly.
        </p>
        <div style={styles.exampleBox}>
          <strong style={styles.exampleTitle}>Why it works:</strong>
          <p style={styles.p}>
            Horizontal AI tools (ChatGPT, Claude) solve everything mediocrely. A vertical tool that understands your
            specific data format, your regulatory requirements, your industry jargon — that solves one thing brilliantly.
            A lawyer doesn't want "an AI assistant." They want a tool that reads a 400-page contract and flags clauses
            that conflict with their client's standard terms. That specificity is worth $200/month.
          </p>
          <div style={styles.verticalGrid}>
            {[
              { niche: 'Real estate agents', pain: 'Property description writing', solution: 'AI generates listings from photos + MLS data, matches local style' },
              { niche: 'Small clinic doctors', pain: 'Insurance claim coding', solution: 'AI reads consultation notes, suggests ICD codes, flags audit risks' },
              { niche: 'Local restaurant owners', pain: 'Multi-platform menu management', solution: 'Update once, AI syncs to Zomato, Swiggy, Google, own website' },
              { niche: 'Freelance translators', pain: 'Consistency across large docs', solution: 'AI maintains glossary, flags inconsistencies, preserves tone' },
            ].map(v => (
              <div key={v.niche} style={styles.verticalCard}>
                <div style={styles.verticalNiche}>{v.niche}</div>
                <div style={styles.verticalPain}><span style={styles.verticalLabel}>Pain:</span> {v.pain}</div>
                <div style={styles.verticalSolution}><span style={styles.verticalLabel}>AI Solution:</span> {v.solution}</div>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={120}>
        <h3 style={styles.h3}>Pattern 2: AI-Augmented Services</h3>
        <p style={styles.p}>
          Don't sell software. Sell a <em>service</em> powered by AI that lets you deliver at 10x the scale. You're the
          expert interface; AI is the engine. Clients pay for your judgment, not your keystrokes.
        </p>
        <div style={styles.exampleBox}>
          <strong style={styles.exampleTitle}>Examples:</strong>
          <ul style={styles.ul}>
            <li>A solo "agency" doing SEO audits — AI crawls and analyzes, you deliver the strategy</li>
            <li>A one-person data analytics consultancy — AI processes the data, you interpret and present</li>
            <li>A freelance security auditor — AI scans for vulnerabilities, you prioritize and write the report</li>
            <li>A solo recruiter — AI screens 500 resumes, you evaluate the top 20</li>
          </ul>
        </div>
      </FadeIn>

      <FadeIn delay={180}>
        <h3 style={styles.h3}>Pattern 3: Community-First Products</h3>
        <p style={styles.p}>
          Build in public. Share what you're learning. Let the community shape the product. The product emerges from
          real conversations, not market research decks.
        </p>
        <Insight tag="distribution secret">
          The biggest challenge for any product isn't building — it's distribution. Solo developers who build in communities
          they're already part of have solved distribution before writing a line of code. A developer who's been active in
          an Indian stock trading Telegram group for 3 years doesn't need a marketing strategy. They need to say "I built
          a thing" and 50 people try it that day. That's a customer acquisition cost of $0.
        </Insight>
      </FadeIn>

      <FadeIn delay={240}>
        <h3 style={styles.h3}>Pattern 4: Autonomous Operations</h3>
        <p style={styles.p}>
          The most advanced solo developers are building systems that run autonomously — AI agents that monitor, respond, and
          escalate without human intervention. Not fully autonomous (that's irresponsible), but <strong>"AI proposes, rules
          approve, human audits"</strong>.
        </p>
        <div style={styles.exampleBox}>
          <strong style={styles.exampleTitle}>The autonomy ladder:</strong>
          <div style={styles.ladderGrid}>
            {[
              { level: 'L1', name: 'Tool', desc: 'You ask AI, AI answers. Manual trigger, manual review.' },
              { level: 'L2', name: 'Assistant', desc: 'AI monitors and alerts. You decide and act.' },
              { level: 'L3', name: 'Autopilot', desc: 'AI decides and acts within guardrails. You audit daily.' },
              { level: 'L4', name: 'Autonomous', desc: 'AI handles routine end-to-end. You handle exceptions.' },
              { level: 'L5', name: 'Digital Twin', desc: 'AI operates as you would. You set strategy.' },
            ].map(l => (
              <div key={l.level} style={styles.ladderRow}>
                <span style={styles.ladderLevel}>{l.level}</span>
                <div>
                  <strong style={{ color: 'var(--text-h)' }}>{l.name}</strong>
                  <p style={{ ...styles.p, margin: '2px 0 0', fontSize: 13 }}>{l.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p style={styles.p}>
            Most solo developers are at L2-L3. The ones generating the most revenue per hour are pushing toward L4 — their
            systems handle the routine while they focus on the strategic decisions that actually grow the business.
          </p>
        </div>
      </FadeIn>
    </>
  );
}

/* ─── Tab: Applied Patterns ─── */
function AppliedPatterns() {
  return (
    <>
      <FadeIn delay={0}>
        <h2 style={styles.h2}>Applied Patterns</h2>
        <p style={styles.p}>
          This isn't just a trend piece — it's a <strong>career strategy</strong>. Here's how to apply the solo developer
          thesis in practice as a senior engineer.
        </p>
      </FadeIn>

      <FadeIn delay={60}>
        <Decision question="Why does this matter at a big company?">
          Because every company is trying to figure out how to do more with fewer people. When you demonstrate that you've
          built production systems solo with AI assistance — handling architecture, implementation, testing, deployment,
          monitoring, and iteration — you're showing exactly the leverage that companies want from their senior engineers.
          <br /><br />
          The staff+ engineer who can direct AI to multiply their output by 10x is more valuable than the one who writes
          beautiful code at 1x speed. Companies know this. They're looking for people who've already made the transition.
          <Pill type="green">Career leverage</Pill>
        </Decision>
      </FadeIn>

      <FadeIn delay={120}>
        <h3 style={styles.h3}>Perspectives That Show Depth</h3>
        <div style={styles.angleGrid}>
          {[
            {
              q: '"Tell me about a complex system you\'ve built"',
              a: '"I built a full production system — 1000+ tests, dozens of scheduled jobs, third-party API integrations, real-time monitoring — as a solo developer using AI as my engineering team. I can walk you through the architecture decisions, the failure modes I designed for, and how I maintained velocity without a team."',
            },
            {
              q: '"How do you think about team productivity?"',
              a: '"I think about leverage ratios. Which decisions need human judgment? Which execution can be automated or AI-assisted? In my own work, I\'ve found that 70% of traditional engineering tasks can be AI-assisted, but 100% of the taste and judgment calls are irreducibly human. The staff+ role is knowing which 30% to focus on."',
            },
            {
              q: '"Where do you see the industry going?"',
              a: '"Revenue per engineer is becoming the defining metric. Companies like Midjourney show that small teams with AI leverage can generate more revenue per person than traditional tech companies by 10x. I think every engineering org will look more like a collection of empowered solo developers with AI tools than like traditional hierarchical teams."',
            },
          ].map((item, i) => (
            <div key={i} style={styles.angleCard}>
              <p style={styles.angleQ}>{item.q}</p>
              <p style={styles.angleA}>{item.a}</p>
            </div>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={180}>
        <Insight tag="the meta-point">
          The engineering playbook you're reading right now was built by a solo developer with AI. 15 blog posts, 23 production-grade
          projects with real tests, architecture diagrams, interactive UI — shipped in weeks, not months. That's not a talking point.
          That's proof. When someone asks "can one person really build all this?" you point at this and say "I already did."
        </Insight>
      </FadeIn>

      <FadeIn delay={240}>
        <h3 style={styles.h3}>The Bigger Picture</h3>
        <p style={styles.p}>
          We're at an inflection point. For the first time, a developer from a village in India, a suburb of Lagos, or a small
          town in Brazil has the same building power as a well-funded team in San Francisco. AI didn't just level the playing
          field — it tilted it toward the people with the deepest domain expertise and the lowest overhead.
        </p>
        <p style={styles.p}>
          The next wave of great software companies won't come from Stanford dorm rooms. They'll come from developers who
          understand problems that Stanford has never heard of. The ones who've been waiting for the tools to catch up to
          their ideas. The tools caught up. It's time to build.
        </p>
      </FadeIn>

      <FadeIn delay={300}>
        <Decision question="Is the solo developer advantage permanent, or will big companies catch up?">
          Big companies will get better at using AI — they already are. But the structural advantages of solo/small teams
          are durable: lower cost structure, faster iteration, deeper domain knowledge, direct customer relationships, ability
          to serve niches that are too small for venture-backed companies.
          <br /><br />
          The real question isn't whether big companies will catch up in AI usage. It's whether they can match the
          <strong> speed × domain depth × cost structure</strong> combination that solo developers have. History suggests they
          can't — big companies are optimized for scale, not speed. And in the AI era, speed compounds faster than scale.
        </Decision>
      </FadeIn>
    </>
  );
}

/* ─── Styles ─── */
const styles = {
  article: { maxWidth: 860, margin: '0 auto' },
  header: { marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid var(--border)' },
  eyebrow: { fontSize: 11, fontWeight: 600, color: 'var(--text-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 8 },
  h1: { fontSize: 40, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1.1, fontFamily: 'var(--font-display)', marginBottom: 12, letterSpacing: '-0.02em' },
  subtitle: { fontSize: 16, color: 'var(--text-p)', lineHeight: 1.7 },
  tabBar: { display: 'flex', gap: 4, marginBottom: 32, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 0 },
  tab: { padding: '10px 18px', fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontFamily: 'var(--font-mono)', transition: 'all 0.15s ease', marginBottom: -1 },
  tabActive: { color: 'var(--text-accent)', borderBottomColor: 'var(--text-accent)' },
  body: { minHeight: 400 },
  h2: { fontSize: 26, fontWeight: 700, color: 'var(--text-h)', fontFamily: 'var(--font-display)', marginBottom: 16, marginTop: 0, letterSpacing: '-0.01em' },
  h3: { fontSize: 18, fontWeight: 600, color: 'var(--text-h)', fontFamily: 'var(--font-display)', marginBottom: 12, marginTop: 28 },
  p: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.75, marginBottom: 16 },
  ul: { fontSize: 15, color: 'var(--text-p)', lineHeight: 1.75, marginBottom: 16, paddingLeft: 20 },
  diagram: { margin: '24px 0', padding: 16, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' },
  forceGrid: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 },
  forceCard: { display: 'flex', gap: 16, padding: '16px 20px', background: 'var(--bg-code)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' },
  forceNum: { fontSize: 13, fontWeight: 700, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', flexShrink: 0, paddingTop: 2 },
  forceTitle: { fontSize: 15, color: 'var(--text-h)', display: 'block', marginBottom: 4 },
  forceDesc: { fontSize: 13, color: 'var(--text-p)', lineHeight: 1.65, margin: 0 },
  contrastBox: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, marginBottom: 16 },
  contrastWeak: { padding: 16, background: 'var(--bg-code)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', opacity: 0.7 },
  contrastStrong: { padding: 16, background: 'var(--bg-code)', borderRadius: 'var(--radius-md)', border: '2px solid var(--text-accent)' },
  contrastText: { fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6, margin: '8px 0 0' },
  roleGrid: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 },
  roleCard: { background: 'var(--bg-code)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' },
  roleHeader: { padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' },
  roleBody: { padding: '12px 16px', fontSize: 13, color: 'var(--text-p)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 4 },
  roleLabel: { fontWeight: 600, color: 'var(--text-h)', marginRight: 4 },
  exampleBox: { margin: '16px 0', padding: 20, background: 'var(--bg-code)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' },
  exampleTitle: { fontSize: 14, color: 'var(--text-h)', display: 'block', marginBottom: 8 },
  verticalGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 },
  verticalCard: { padding: 14, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' },
  verticalNiche: { fontSize: 13, fontWeight: 600, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', marginBottom: 8 },
  verticalPain: { fontSize: 12, color: 'var(--text-p)', lineHeight: 1.6, marginBottom: 4 },
  verticalSolution: { fontSize: 12, color: 'var(--text-p)', lineHeight: 1.6 },
  verticalLabel: { fontWeight: 600, color: 'var(--text-h)' },
  ladderGrid: { display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' },
  ladderRow: { display: 'flex', gap: 14, alignItems: 'flex-start', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' },
  ladderLevel: { fontSize: 12, fontWeight: 700, color: 'var(--text-accent)', fontFamily: 'var(--font-mono)', flexShrink: 0, paddingTop: 2, minWidth: 24 },
  angleGrid: { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 },
  angleCard: { padding: 20, background: 'var(--bg-code)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' },
  angleQ: { fontSize: 15, fontWeight: 600, color: 'var(--text-h)', fontStyle: 'italic', marginBottom: 10, fontFamily: 'var(--font-display)' },
  angleA: { fontSize: 13, color: 'var(--text-p)', lineHeight: 1.75, margin: 0 },
};
