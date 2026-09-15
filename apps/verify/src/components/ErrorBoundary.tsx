import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Top-level render error boundary for the resident portal.
 *
 * Catches unhandled React render errors and displays a Civic-styled fallback
 * instead of a blank screen. PHI and raw error messages are never rendered —
 * the fallback copy is fully static.
 *
 * Usage: wrap the App in main.tsx (outermost provider layer, inside StrictMode).
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Production error reporting (e.g. Sentry) would be wired here.
    // Deliberately not logging _error or _info — they may contain PHI
    // from component props/state captured in the component stack.
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. Please refresh the page to try again. If the problem continues, contact
                support.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="text-sm font-medium underline underline-offset-4 text-foreground hover:text-foreground/80"
              >
                Refresh page
              </button>
            </CardContent>
          </Card>
        </main>
      );
    }

    return this.props.children;
  }
}
