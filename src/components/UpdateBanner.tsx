import { useState } from 'react';
import { Download, RefreshCw, X, ExternalLink, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useStore } from '../store/store';

/** Bottom-right card that appears when a newer version is available, downloading or ready. */
export default function UpdateBanner() {
    const { updateStatus, dismissedUpdateVersion, dismissUpdateBanner, downloadUpdate, installUpdate } = useStore();
    const [notesOpen, setNotesOpen] = useState(false);

    if (!updateStatus) return null;
    const { state, version, releaseNotes, progress, manualInstall, releaseUrl } = updateStatus;
    const relevant = state === 'available' || state === 'downloading' || state === 'downloaded';
    if (!relevant || (version && dismissedUpdateVersion === version && state !== 'downloaded')) return null;

    return (
        <div className="fixed bottom-6 right-6 w-80 bg-primary-card border border-accent-gray rounded-xl shadow-2xl p-4 z-40 space-y-3" data-testid="update-banner">
            <div className="flex items-start gap-3">
                <div className="p-2 bg-accent-blue/10 rounded-lg text-accent-blue flex-shrink-0">
                    <Sparkles size={18} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary">
                        {state === 'downloaded' ? `Modelist ${version} is ready` : `Modelist ${version} is available`}
                    </div>
                    <div className="text-xs text-text-secondary">
                        {state === 'downloading'
                            ? `Downloading… ${Math.round(progress?.percent ?? 0)}%`
                            : state === 'downloaded'
                                ? 'Restart to finish installing the update.'
                                : manualInstall
                                    ? 'This copy cannot update itself; download it from the release page.'
                                    : 'Download now or later; it installs on the next restart.'}
                    </div>
                </div>
                {state !== 'downloading' && (
                    <button onClick={dismissUpdateBanner} className="p-1 rounded hover:bg-primary-hover text-text-secondary hover:text-text-primary" title="Later">
                        <X size={16} />
                    </button>
                )}
            </div>

            {state === 'downloading' && (
                <div className="h-1.5 bg-primary-bg rounded overflow-hidden">
                    <div className="h-full bg-accent-blue transition-all duration-300" style={{ width: `${Math.max(2, progress?.percent ?? 0)}%` }} />
                </div>
            )}

            {releaseNotes && state === 'available' && (
                <div>
                    <button onClick={() => setNotesOpen((v) => !v)} className="text-xs text-accent-blue hover:underline flex items-center gap-1">
                        {notesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} What's new
                    </button>
                    {notesOpen && (
                        <pre className="mt-2 text-xs text-text-secondary whitespace-pre-wrap font-sans max-h-40 overflow-y-auto bg-primary-bg rounded-lg p-2">{releaseNotes}</pre>
                    )}
                </div>
            )}

            <div className="flex gap-2">
                {state === 'available' && !manualInstall && (
                    <button onClick={() => void downloadUpdate()} className="btn btn-primary text-sm flex-1">
                        <Download size={14} /> Download
                    </button>
                )}
                {state === 'available' && manualInstall && releaseUrl && (
                    <button onClick={() => void window.electronAPI.openExternal(releaseUrl)} className="btn btn-primary text-sm flex-1">
                        <ExternalLink size={14} /> Open release page
                    </button>
                )}
                {state === 'downloaded' && (
                    <button onClick={() => void installUpdate()} className="btn btn-primary text-sm flex-1">
                        <RefreshCw size={14} /> Restart now
                    </button>
                )}
                {state !== 'downloading' && (
                    <button onClick={dismissUpdateBanner} className="btn btn-secondary text-sm">Later</button>
                )}
            </div>
        </div>
    );
}
