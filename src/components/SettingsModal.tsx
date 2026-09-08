import { useState } from 'react';
import { X, Settings as SettingsIcon, Monitor, Github, Info, Database, RefreshCw, FileX, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../store/store';
import { ConfirmDialog } from './ConfirmDialog';

export default function SettingsModal() {
    const { closeSettings, theme, setTheme, indexProgress, libraryStats, loadModels, slicers, loadSlicers, setDefaultSlicer, addCustomSlicer, removeCustomSlicer } = useStore();
    const [rescanning, setRescanning] = useState(false);

    const handleRescan = async () => {
        setRescanning(true);
        try {
            await loadSlicers(true);
        } finally {
            setRescanning(false);
        }
    };
    const [regenerateThumbnails, setRegenerateThumbnails] = useState(false);
    const [rebuildRequested, setRebuildRequested] = useState(false);
    const [confirmForget, setConfirmForget] = useState(false);
    const [forgetResult, setForgetResult] = useState<number | null>(null);
    const missingCount = libraryStats?.missing ?? 0;

    const handleForgetMissing = async () => {
        setConfirmForget(false);
        try {
            const removed = await window.electronAPI.forgetMissingModels();
            setForgetResult(removed);
            await loadModels();
        } catch (error) {
            console.error('Failed to forget missing files:', error);
        }
    };

    const handleRebuild = async () => {
        setRebuildRequested(true);
        try {
            await window.electronAPI.rebuildIndex({ regenerateThumbnails });
        } catch (error) {
            console.error('Failed to rebuild index:', error);
        } finally {
            setTimeout(() => setRebuildRequested(false), 2000);
        }
    };

    const themeButton = (value: 'dark' | 'light' | 'system', label: string) => (
        <button
            onClick={() => setTheme(value)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${theme === value ? 'bg-primary-card shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <ConfirmDialog
                isOpen={confirmForget}
                title="Forget missing files"
                message={`Remove ${missingCount} missing file${missingCount === 1 ? '' : 's'} from the library, including their tags, notes and thumbnails? Nothing on disk is touched. If a drive is just disconnected, plug it back in instead.`}
                confirmLabel="Forget"
                isDestructive
                onConfirm={handleForgetMissing}
                onCancel={() => setConfirmForget(false)}
            />
            <div className="bg-primary-card w-full max-w-2xl rounded-xl border border-accent-gray shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="px-6 py-4 border-b border-accent-gray flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent-blue/10 rounded-lg">
                            <SettingsIcon size={20} className="text-accent-blue" />
                        </div>
                        <h2 className="text-xl font-semibold text-text-primary">Settings</h2>
                    </div>
                    <button onClick={closeSettings} className="p-2 hover:bg-primary-hover rounded-lg transition-colors text-text-secondary hover:text-text-primary">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    <section className="space-y-4">
                        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <Monitor size={14} /> Appearance
                        </h3>
                        <div className="bg-primary-bg rounded-lg border border-accent-gray p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-text-primary">Theme</div>
                                    <div className="text-sm text-text-secondary">Choose your preferred theme</div>
                                </div>
                                <div className="flex bg-primary-bg rounded-lg p-1 border border-accent-gray">
                                    {themeButton('dark', 'Dark')}
                                    {themeButton('light', 'Light')}
                                    {themeButton('system', 'System')}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <Database size={14} /> Library index
                        </h3>
                        <div className="bg-primary-bg rounded-lg border border-accent-gray p-4 space-y-4">
                            <div className="text-sm text-text-secondary">
                                Every file is hashed and measured in the background, and its name, folder, tags, notes and any README beside it are added to the search index.
                                {indexProgress?.isRunning
                                    ? ` Indexing ${indexProgress.completed + indexProgress.failed} of ${indexProgress.total}…`
                                    : ` ${(libraryStats?.models ?? 0).toLocaleString()} models in the library.`}
                            </div>
                            <label className="flex items-center gap-2 text-sm text-text-primary select-none cursor-pointer">
                                <input type="checkbox" checked={regenerateThumbnails} onChange={(e) => setRegenerateThumbnails(e.target.checked)} className="accent-blue-500" />
                                Also re-render 3D thumbnails (keeps captured and embedded previews)
                            </label>
                            <button onClick={handleRebuild} disabled={rebuildRequested} className="btn btn-secondary text-sm">
                                <RefreshCw size={14} className={rebuildRequested ? 'animate-spin' : ''} />
                                {rebuildRequested ? 'Rebuilding…' : 'Rebuild search index'}
                            </button>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <ExternalLink size={14} /> Slicers
                        </h3>
                        <div className="bg-primary-bg rounded-lg border border-accent-gray p-4 space-y-3">
                            <div className="text-sm text-text-secondary">
                                Installed slicers are found automatically. Pick the one "Open in Slicer" should use, or add one the scan did not find.
                            </div>
                            <div className="divide-y divide-accent-gray border border-accent-gray rounded-lg overflow-hidden">
                                {slicers.map((slicer) => (
                                    <label key={slicer.id} className="flex items-center gap-3 px-3 py-2 hover:bg-primary-hover cursor-pointer select-none">
                                        <input
                                            type="radio"
                                            name="default-slicer"
                                            checked={slicer.isDefault}
                                            onChange={() => setDefaultSlicer(slicer.id === 'system' ? null : slicer.id)}
                                            className="accent-blue-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-text-primary flex items-center gap-2">
                                                {slicer.name}
                                                {slicer.isCustom && <span className="text-[10px] text-text-secondary uppercase">custom</span>}
                                            </div>
                                            {slicer.path && <div className="text-xs text-text-secondary truncate font-mono" title={slicer.path}>{slicer.path}</div>}
                                        </div>
                                        {slicer.isCustom && (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    void removeCustomSlicer(slicer.id);
                                                }}
                                                className="p-1.5 rounded hover:bg-red-500/20 text-text-secondary hover:text-red-400"
                                                title="Remove"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </label>
                                ))}
                                {slicers.length === 0 && <div className="px-3 py-3 text-sm text-text-secondary italic">Scanning…</div>}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleRescan} disabled={rescanning} className="btn btn-secondary text-sm">
                                    <RefreshCw size={14} className={rescanning ? 'animate-spin' : ''} /> Rescan
                                </button>
                                <button onClick={() => void addCustomSlicer()} className="btn btn-secondary text-sm">
                                    <Plus size={14} /> Add slicer…
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <FileX size={14} /> Missing files
                        </h3>
                        <div className="bg-primary-bg rounded-lg border border-accent-gray p-4 space-y-4">
                            <div className="text-sm text-text-secondary">
                                When a file disappears (deleted, moved, or its drive is unplugged) it is flagged instead of removed, so tags, notes
                                and collections survive. Files that come back are restored automatically.
                                {' '}
                                {missingCount > 0
                                    ? `${missingCount} file${missingCount === 1 ? ' is' : 's are'} currently missing.`
                                    : 'No files are missing right now.'}
                                {forgetResult !== null && ` Removed ${forgetResult} entr${forgetResult === 1 ? 'y' : 'ies'}.`}
                            </div>
                            <button onClick={() => setConfirmForget(true)} disabled={missingCount === 0} className="btn btn-secondary text-sm disabled:opacity-50">
                                <FileX size={14} />
                                Forget missing files
                            </button>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <Info size={14} /> About
                        </h3>
                        <div className="bg-primary-bg rounded-lg border border-accent-gray p-6 text-center space-y-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                                <SettingsIcon size={32} className="text-white" />
                            </div>
                            <div>
                                <h4 className="text-lg font-semibold text-text-primary">Modelist</h4>
                                <p className="text-text-secondary text-sm max-w-sm mx-auto pt-2">
                                    An offline-first 3D model organizer and viewer for STL, 3MF and OBJ files with collections, tags, full-text search and a 3D preview.
                                </p>
                            </div>
                            <div className="pt-4 border-t border-accent-gray flex justify-center gap-4">
                                <button
                                    onClick={() => window.open('https://github.com/canerkoroglu/3d-file-library', '_blank')}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary-card hover:bg-primary-hover rounded-lg text-sm text-text-primary transition-colors border border-accent-gray"
                                >
                                    <Github size={16} /> GitHub
                                </button>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="px-6 py-4 border-t border-accent-gray bg-primary-card flex justify-end gap-3 flex-shrink-0">
                    <button onClick={closeSettings} className="px-4 py-2 bg-primary-hover hover:bg-accent-gray rounded-lg text-sm text-text-primary transition-colors font-medium border border-accent-gray">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
