import { Component } from 'react';

/**
 * Error boundary — catches unhandled React render errors in its subtree
 * and displays a fallback UI instead of unmounting the whole tree.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <DangerousComponent />
 *   </ErrorBoundary>
 *
 * Per React docs: only class components can be error boundaries (no hook
 * equivalent exists for componentDidCatch / getDerivedStateFromError).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging — a production app would ship to an
    // observability service (Sentry, Datadog, etc.)
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    if (this.state.error) {
      // Custom fallback is provided — use it
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          reset: this.handleReset,
        });
      }

      // Default fallback UI — matches the industrial MD3 dark theme
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-lg">
          <div className="bg-surface-container border border-outline-variant rounded-xl p-xl max-w-lg w-full text-center">
            {/* Icon */}
            <span className="material-symbols-outlined text-6xl text-error mb-md block">
              error
            </span>

            {/* Heading */}
            <h2 className="font-headline-md text-headline-md text-on-surface mb-sm">
              Something went wrong
            </h2>

            {/* Description */}
            <p className="font-body-md text-body-md text-on-surface-variant mb-lg">
              An unexpected error occurred in this component. You can try
              recovering, or refresh the page if the problem persists.
            </p>

            {/* Error details (collapsed by default for production safety) */}
            <details className="mb-lg text-left">
              <summary className="font-label-caps text-label-caps text-on-surface-variant cursor-pointer hover:text-on-surface transition-colors">
                Technical details
              </summary>
              <pre className="mt-sm p-md bg-surface-container-low border border-outline-variant rounded text-xs font-data-mono text-on-surface-variant overflow-auto max-h-48 whitespace-pre-wrap break-all">
                {this.state.error?.message || String(this.state.error)}
                {this.state.errorInfo?.componentStack
                  ? `\n\nComponent stack:\n${this.state.errorInfo.componentStack}`
                  : ''}
              </pre>
            </details>

            {/* Actions */}
            <div className="flex items-center justify-center gap-sm">
              <button
                onClick={this.handleReset}
                className="px-lg py-sm bg-primary text-on-primary rounded font-label-caps text-label-caps hover:bg-primary/90 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-lg py-sm bg-surface-container-highest text-on-surface-variant border border-outline-variant rounded font-label-caps text-label-caps hover:bg-surface-container-high transition-colors"
              >
                Reload page
              </button>
            </div>

            <p className="font-data-mono text-[10px] text-on-surface-variant/40 mt-lg">
              Error Boundary · Pineapple Hub v2
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
