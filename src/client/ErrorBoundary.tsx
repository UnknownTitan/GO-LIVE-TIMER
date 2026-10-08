import { Component, type ReactNode } from 'react';

/** Shows a plain message (with a reload button) instead of a blank page if rendering fails. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page">
        <p className="notice" role="alert">
          Something went wrong showing this page.{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              try {
                localStorage.removeItem('golive:countdown');
              } catch {
                // ignore
              }
              location.reload();
            }}
          >
            Reload
          </button>
        </p>
      </main>
    );
  }
}
