import { useEffect, useState } from 'react';
import { X, FileArchive, Plus, Trash2, FolderOpen, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useStore } from '../store/store';
import type { ZipImportResult } from '../types';

function baseName(filePath: string): string {
    return filePath.split(/[\\/]/).pop() ?? filePath;
}

export default function ImportZipDialog() {
    const { importZipDialog, closeImportZip, collections, loadModels } = useStore();
    const watched = collections.filter((c) => c.type === 'watched' && c.isOnline !== false);

    const [zipPaths, setZipPaths] = useState<string[]>(importZipDialog.zipPaths);
    const [collectionId, setCollectionId] = useState<number | ''>(watched[0]?.id ?? '');
    const [isImporting, setIsImporting] = useState(false);
    const [results, setResults] = useState<ZipImportResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setZipPaths(importZipDialog.zipPaths);
    }, [importZipDialog.zipPaths]);

    useEffect(() => {
        if (collectionId === '' && watched.length > 0) setCollectionId(watched[0].id);
    }, [watched, collectionId]);

    const addZips = async () => {
        const picked = await window.electronAPI.pickZipFiles();
        if (picked.length > 0) setZipPaths((current) => [...new Set([...current, ...picked])]);
    };

    const runImport = async () => {
        if (zipPaths.length === 0 || collectionId === '') return;
        setIsImporting(true);
        setError(null);
        try {
            const outcome = await window.electronAPI.importZip({ zipPaths, collectionId });
            setResults(outcome);
            await loadModels();
        } catch (err) {
            setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(err));
        } finally {
            setIsImporting(false);
        }
    };

    const totalModels = results?.reduce((sum, r) => sum + r.models, 0) ?? 0;

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isImporting) closeImportZip();
            }}
        >
            <div className="bg-primary-card w-full max-w-xl rounded-xl border border-accent-gray shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="px-6 py-4 border-b border-accent-gray flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent-blue/10 rounded-lg">
                            <FileArchive size={20} className="text-accent-blue" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-text-primary">Import ZIP</h2>
                            <p className="text-xs text-text-secondary">Extracts downloads from Thingiverse, Printables and friends into a watched folder.</p>
                        </div>
                    </div>
                    <button onClick={closeImportZip} disabled={isImporting} className="p-2 hover:bg-primary-hover rounded-lg transition-colors text-text-secondary hover:text-text-primary">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {results ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-sm text-text-primary">
                                <CheckCircle2 size={18} className="text-green-500" />
                                Imported {totalModels} model{totalModels === 1 ? '' : 's'} from {results.length} archive{results.length === 1 ? '' : 's'}.
                            </div>
                            <div className="divide-y divide-accent-gray border border-accent-gray rounded-lg overflow-hidden text-sm">
                                {results.map((r) => (
                                    <div key={r.zipPath} className="px-3 py-2 flex items-start gap-3">
                                        {r.error ? <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" /> : <FileArchive size={16} className="text-text-secondary mt-0.5 flex-shrink-0" />}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-text-primary truncate">{baseName(r.zipPath)}</div>
                                            {r.error ? (
                                                <div className="text-xs text-red-400">{r.error}</div>
                                            ) : (
                                                <div className="text-xs text-text-secondary">
                                                    {r.models} model{r.models === 1 ? '' : 's'}, {r.extracted} file{r.extracted === 1 ? '' : 's'}
                                                    {r.skipped > 0 && `, ${r.skipped} skipped`}
                                                    {' → '}
                                                    <button onClick={() => window.electronAPI.openFolder(r.folder)} className="text-accent-blue hover:underline inline-flex items-center gap-1">
                                                        <FolderOpen size={12} /> {baseName(r.folder)}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div>
                                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Archives</div>
                                <div className="border border-accent-gray rounded-lg overflow-hidden divide-y divide-accent-gray">
                                    {zipPaths.map((p) => (
                                        <div key={p} className="px-3 py-2 flex items-center gap-3 text-sm">
                                            <FileArchive size={16} className="text-text-secondary flex-shrink-0" />
                                            <span className="flex-1 truncate text-text-primary" title={p}>{baseName(p)}</span>
                                            <button onClick={() => setZipPaths((current) => current.filter((x) => x !== p))} className="p-1 rounded hover:bg-red-500/20 text-text-secondary hover:text-red-400" title="Remove">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    <button onClick={addZips} className="w-full px-3 py-2 text-sm text-accent-blue hover:bg-primary-hover flex items-center gap-2">
                                        <Plus size={14} /> {zipPaths.length === 0 ? 'Choose ZIP files…' : 'Add more…'}
                                    </button>
                                </div>
                                <div className="text-xs text-text-secondary mt-2">You can also drop ZIP files anywhere on the window.</div>
                            </div>

                            <div>
                                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Extract into</div>
                                {watched.length === 0 ? (
                                    <div className="text-sm text-yellow-500 flex items-center gap-2">
                                        <AlertTriangle size={16} /> Add a watched folder first; archives are extracted into one of them.
                                    </div>
                                ) : (
                                    <select value={collectionId} onChange={(e) => setCollectionId(Number(e.target.value))} className="input w-full">
                                        {watched.map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}  ({c.folderPath})</option>
                                        ))}
                                    </select>
                                )}
                                <div className="text-xs text-text-secondary mt-2">
                                    Each archive gets its own sub-folder, so READMEs, licenses and preview images stay next to the models.
                                </div>
                            </div>

                            {error && (
                                <div className="text-sm text-red-400 flex items-center gap-2">
                                    <AlertTriangle size={16} /> {error}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-accent-gray bg-primary-card flex justify-end gap-3 flex-shrink-0">
                    {results ? (
                        <button onClick={closeImportZip} className="btn btn-primary">Done</button>
                    ) : (
                        <>
                            <button onClick={closeImportZip} disabled={isImporting} className="btn btn-secondary">Cancel</button>
                            <button onClick={runImport} disabled={isImporting || zipPaths.length === 0 || collectionId === ''} className="btn btn-primary disabled:opacity-50">
                                {isImporting ? <Loader2 size={16} className="animate-spin" /> : <FileArchive size={16} />}
                                {isImporting ? 'Importing…' : `Import ${zipPaths.length || ''}`.trim()}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
