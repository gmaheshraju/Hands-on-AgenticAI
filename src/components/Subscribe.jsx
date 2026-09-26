import { useState } from 'react';

// Kit (formerly ConvertKit) form endpoint. Posting a form directly needs no
// backend and no secret — the form id is public by design.
//
// TO ACTIVATE: create a free Kit account, add a form, paste its numeric id here.
// Until then this component renders nothing, so the post footer still ships
// its call to action without a dead input box.
const FORM_ID = '';
const ACTION = `https://app.kit.com/forms/${FORM_ID}/subscriptions`;

const track = (name) => window.clarity?.('event', name);

export default function Subscribe() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error

  if (!FORM_ID) return null;

  async function onSubmit(e) {
    e.preventDefault();
    if (state === 'sending') return;
    // Bots fill hidden fields; humans never see this one.
    if (e.target.company.value) { setState('done'); return; }

    setState('sending');
    track('subscribe_submit');
    try {
      const res = await fetch(ACTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email_address: email }),
      });
      if (!res.ok) throw new Error(`Kit responded ${res.status}`);
      setState('done');
      track('subscribe_success');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <p style={styles.done}>
        Check your inbox to confirm. The first email has the checklist in it.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} style={styles.form}>
      <label htmlFor="sub-email" style={styles.label}>
        New posts on production AI systems. No cadence promises, no filler.
      </label>
      <div style={styles.row}>
        <input
          id="sub-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          style={styles.input}
        />
        <button type="submit" disabled={state === 'sending'} style={styles.button}>
          {state === 'sending' ? 'Sending…' : 'Subscribe'}
        </button>
      </div>
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={styles.honeypot}
      />
      {state === 'error' && (
        <p style={styles.error}>
          That did not go through. Email me directly and I will add you by hand.
        </p>
      )}
    </form>
  );
}

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 },
  label: { fontSize: 13, color: 'var(--text-p)', lineHeight: 1.6 },
  row: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  input: {
    flex: '1 1 220px',
    minWidth: 0,
    padding: '9px 14px',
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    color: 'var(--text-h)',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-full)',
  },
  button: {
    padding: '9px 20px',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'var(--font-body)',
    color: 'var(--text-on-accent)',
    background: 'var(--bg-accent-strong)',
    border: 'none',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
  },
  honeypot: { position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 },
  done: { fontSize: 13, color: 'var(--text-accent)', marginTop: 20, lineHeight: 1.6 },
  error: { fontSize: 12, color: 'var(--text-danger)', lineHeight: 1.6 },
};
