import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className="min-h-screen flex items-center justify-center p-8"
                    style={{ backgroundColor: '#0D0D0D', color: '#E6E6E6' }}
                >
                    <div className="max-w-md text-center">
                        <div className="w-16 h-16 rounded-full border-2 border-red-400 flex items-center justify-center mx-auto mb-6">
                            <span className="text-2xl">⚠</span>
                        </div>
                        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
                        <p className="text-sm text-gray-400 mb-6">
                            The observatory encountered an unexpected error. This has been logged.
                        </p>
                        {this.state.error && (
                            <pre className="text-xs text-red-400 bg-white/5 p-3 rounded mb-6 text-left overflow-auto max-h-32">
                                {this.state.error.message}
                            </pre>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 border-2 border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-white text-sm font-semibold tracking-wider uppercase rounded transition-colors"
                        >
                            Reload Observatory
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
