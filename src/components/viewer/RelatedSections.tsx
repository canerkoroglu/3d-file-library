/** Content that is fetched on demand: models similar to this one, and the README next to the file. */
import { useEffect, useState } from 'react';
import { Box, ChevronDown, ChevronRight, FileText, Sparkles } from 'lucide-react';
import { useStore } from '../../store/store';
import { thumbnailUrl } from '../../lib/format';
import type { ModelWithTags } from '../../types';

export function SimilarSection({ model }: { model: ModelWithTags }) {
    const openViewer = useStore((s) => s.openViewer);
    const [similar, setSimilar] = useState<ModelWithTags[]>([]);

    useEffect(() => {
        let cancelled = false;
        window.electronAPI.findSimilar(model.id, 8)
            .then((results) => { if (!cancelled) setSimilar(results); })
            .catch(() => { if (!cancelled) setSimilar([]); });
        return () => { cancelled = true; };
    }, [model.id]);

    if (similar.length === 0) return null;
    return (
        <section>
            <h3 className="text-sm font-semibold mb-3 text-text-primary flex items-center gap-2"><Sparkles size={14} className="text-accent-blue" /> Similar models</h3>
            <div className="grid grid-cols-2 gap-2">
                {similar.map((m) => (
                    <button key={m.id} onClick={() => openViewer(m)} className="flex items-center gap-2 p-2 bg-primary-bg rounded-lg border border-accent-gray hover:border-accent-blue text-left min-w-0">
                        {thumbnailUrl(m) ? (
                            <img src={thumbnailUrl(m)!} alt="" className="w-10 h-10 rounded-sm object-cover bg-primary-card shrink-0" />
                        ) : (
                            <div className="w-10 h-10 rounded-sm bg-primary-card flex items-center justify-center shrink-0"><Box size={16} className="text-text-secondary" /></div>
                        )}
                        <span className="text-xs text-text-primary truncate">{m.displayName || m.filename}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}

export function ReadmeSection({ model }: { model: ModelWithTags }) {
    const [open, setOpen] = useState(false);
    const [readme, setReadme] = useState<string | null>(null);

    useEffect(() => {
        if (!model.hasReadme) return;
        let cancelled = false;
        void window.electronAPI.getModelReadme(model.id).then((text) => { if (!cancelled) setReadme(text); });
        return () => { cancelled = true; };
    }, [model.id, model.hasReadme]);

    if (!model.hasReadme) return null;
    return (
        <section>
            <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <FileText size={14} /> README
            </button>
            {open && (
                <pre className="text-xs text-text-primary bg-primary-bg rounded-lg p-3 whitespace-pre-wrap wrap-break-word max-h-64 overflow-y-auto font-sans">
                    {readme ?? 'Loading…'}
                </pre>
            )}
        </section>
    );
}
