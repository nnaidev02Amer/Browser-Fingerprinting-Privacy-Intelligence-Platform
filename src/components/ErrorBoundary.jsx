import { Component } from 'react';

/**
 * Last-resort safety net: if rendering throws, show a readable message instead
 * of a blank page. Nothing is sent anywhere; the error is only logged to the
 * browser console.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Unexpected application error:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-12 max-w-xl rounded-xl border border-red-800 bg-red-950 p-6 text-red-100">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm">
          The page hit an unexpected error. Nothing was uploaded. Reloading usually fixes it; your saved choices and
          history stay in this browser.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Reload page
        </button>
      </div>
    );
  }
}
