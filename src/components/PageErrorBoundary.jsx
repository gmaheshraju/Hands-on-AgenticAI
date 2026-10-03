import { Component } from 'react';

// A page chunk that cannot load (offline, blocked, removed by a deploy) would
// otherwise unmount the whole app and leave a blank screen. Show a way out instead.
export default class PageErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev) {
    // Navigating elsewhere gets a fresh attempt.
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ maxWidth: 560, padding: '3rem 0 5rem' }} role="alert">
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 36, color: 'var(--text-h)', marginBottom: 12 }}>
          This page did not load
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-p)', lineHeight: 1.7, marginBottom: 24 }}>
          Usually the connection dropped or the site was just updated. Reloading fixes both.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}
