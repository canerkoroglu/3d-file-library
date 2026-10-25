import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ExternalLink, Folder, Settings as SettingsIcon } from 'lucide-react';
import { useStore } from '../../store/store';
import type { ModelWithTags } from '../../types';

/** Footer actions: open in a slicer (default or chosen) and reveal the file. */
export default function ViewerActions({ model, missing }: { model: ModelWithTags; missing: boolean }) {
    const { slicers, openInSlicer, openSettings } = useStore();
    const [menuOpen, setMenuOpen] = useState(false);
    const [slicerError, setSlicerError] = useState<string | null>(null);
    const defaultSlicer = slicers.find((s) => s.isDefault) ?? slicers[0];

    const launchSlicer = async (slicerId?: string) => {
        setMenuOpen(false);
        setSlicerError(null);
        const error = await openInSlicer(model.filepath, slicerId);
        if (error) setSlicerError(error);
    };

    return (
        <div className="p-4 border-t border-accent-gray space-y-2 shrink-0 bg-primary-card">
            <div className="relative">
                <div className="flex">
                    <button
                        onClick={() => launchSlicer()}
                        className="btn btn-primary flex-1 rounded-r-none disabled:opacity-50 min-w-0"
                        disabled={missing}
                        title={defaultSlicer ? defaultSlicer.path || 'Opens with the app your system associates with this file type' : undefined}
                    >
                        <ExternalLink size={16} />
                        <span className="truncate">{defaultSlicer && defaultSlicer.id !== 'system' ? `Open in ${defaultSlicer.name}` : 'Open in Slicer'}</span>
                    </button>
                    <button
                        onClick={() => setMenuOpen((v) => !v)}
                        className="btn btn-primary rounded-l-none border-l border-white/20 px-2 disabled:opacity-50"
                        disabled={missing}
                        title="Choose a slicer"
                        aria-label="Choose a slicer"
                    >
                        <ChevronDown size={16} />
                    </button>
                </div>
                {menuOpen && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-primary-card border border-accent-gray rounded-lg shadow-2xl overflow-hidden z-10">
                        {slicers.map((slicer) => (
                            <button
                                key={slicer.id}
                                onClick={() => launchSlicer(slicer.id)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-primary-hover flex items-center gap-2"
                                title={slicer.path || undefined}
                            >
                                {slicer.isDefault ? <Check size={14} className="text-accent-blue" /> : <span className="w-3.5" />}
                                <span className="flex-1 truncate">{slicer.name}</span>
                                {slicer.isCustom && <span className="text-[10px] text-text-secondary uppercase">custom</span>}
                            </button>
                        ))}
                        <button
                            onClick={() => {
                                setMenuOpen(false);
                                openSettings();
                            }}
                            className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-primary-hover border-t border-accent-gray flex items-center gap-2"
                        >
                            <SettingsIcon size={12} /> Slicer settings…
                        </button>
                    </div>
                )}
            </div>
            {slicerError && (
                <div className="text-xs text-red-400 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {slicerError}
                </div>
            )}
            <button
                onClick={() => window.electronAPI.openFolder(model.filepath).catch((err) => console.error(err))}
                className="btn btn-secondary w-full disabled:opacity-50"
                disabled={missing}
            >
                <Folder size={16} /> Show in Folder
            </button>
        </div>
    );
}
