import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';
import { useStore } from '../store/store';
import type { ToastKind } from '../store/store';

const ICONS: Record<ToastKind, React.ReactNode> = {
    info: <Info size={18} className="text-accent-blue" />,
    success: <CheckCircle2 size={18} className="text-green-500" />,
    warning: <AlertTriangle size={18} className="text-yellow-500" />,
    error: <XCircle size={18} className="text-red-400" />,
};

/** Stack of transient notifications in the top-right corner. */
export default function ToastHost() {
    const { toasts, dismissToast } = useStore();
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-16 right-4 z-[80] flex flex-col gap-2 w-80 pointer-events-none" data-testid="toast-host" aria-live="polite">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    role={toast.kind === 'error' ? 'alert' : 'status'}
                    data-kind={toast.kind}
                    className="pointer-events-auto bg-primary-card border border-accent-gray rounded-lg shadow-2xl p-3 flex items-start gap-3 animate-in fade-in slide-in-from-right-4 duration-200"
                >
                    <div className="flex-shrink-0 mt-0.5">{ICONS[toast.kind]}</div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary break-words">{toast.title}</div>
                        {toast.message && <div className="text-xs text-text-secondary mt-0.5 break-words whitespace-pre-line">{toast.message}</div>}
                    </div>
                    <button onClick={() => dismissToast(toast.id)} className="p-1 rounded hover:bg-primary-hover text-text-secondary hover:text-text-primary flex-shrink-0" title="Dismiss" aria-label="Dismiss">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}
