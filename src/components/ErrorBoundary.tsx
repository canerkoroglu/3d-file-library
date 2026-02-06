import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-primary-bg text-text-primary flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-primary-card border border-accent-gray rounded-xl p-8 shadow-2xl text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertTriangle size={32} className="text-red-500" />
                        </div>

                        <h1 className="text-2xl font-bold mb-3">Something went wrong</h1>
                        <p className="text-text-secondary mb-6 text-sm">
                            The application encountered an unexpected error. We've logged the issue and you can try reloading to recover.
                        </p>

                        <div className="bg-primary-bg rounded-lg p-4 mb-6 text-left overflow-auto max-h-40 border border-accent-gray">
                            <code className="text-xs text-red-400 font-mono break-words whitespace-pre-wrap">
                                {this.state.error?.toString()}
                            </code>
                        </div>

                        <button
                            onClick={this.handleReload}
                            className="bg-accent-blue hover:bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 w-full"
                        >
                            <RefreshCw size={18} />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
