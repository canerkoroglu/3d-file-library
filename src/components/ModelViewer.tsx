import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Stage } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { X, Tag as TagIcon, ExternalLink, Folder, Camera, Plus, Pencil, FileText, ChevronDown, ChevronRight, AlertTriangle, FileX, Settings as SettingsIcon, Check, RotateCw, Grid3x3, Box, Palette, Scissors, Maximize2 } from 'lucide-react';
import { useStore } from '../store/store';
import GenericModel, { type ViewerDisplayOptions } from './GenericModel';
import MetadataEditor from './MetadataEditor';
import { formatDimensions, formatFileSize, formatTriangles, formatVolume } from '../lib/format';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-text-secondary text-xs mb-1">{label}</div>
            <div className="text-text-primary bg-primary-bg px-3 py-2 rounded-lg text-sm break-words">{children}</div>
        </div>
    );
}

export default function ModelViewer() {
    const { selectedModel, closeViewer, tags, addTagToModel, removeTagFromModel, collections, loadModels, slicers, openInSlicer, openSettings, reportError } = useStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [isCreatingTag, setIsCreatingTag] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3b82f6');
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [readme, setReadme] = useState<string | null>(null);
    const [readmeOpen, setReadmeOpen] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [captureState, setCaptureState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [slicerMenuOpen, setSlicerMenuOpen] = useState(false);
    const [slicerError, setSlicerError] = useState<string | null>(null);

    // Viewer tools
    const controlsRef = useRef<OrbitControlsImpl>(null);
    const [autoRotate, setAutoRotate] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [display, setDisplay] = useState<ViewerDisplayOptions>({ wireframe: false, fileColors: true, uniformColor: '#3b82f6', clipHeight: 1 });
    const [showClip, setShowClip] = useState(false);
    const updateDisplay = (patch: Partial<ViewerDisplayOptions>) => setDisplay((current) => ({ ...current, ...patch }));

    const modelId = selectedModel?.id;

    useEffect(() => {
        setIsRenaming(false);
        setRenameValue('');
        setReadme(null);
        setReadmeOpen(false);
        setLoadError(null);
        setCaptureState('idle');
        setSlicerMenuOpen(false);
        setSlicerError(null);
        setDisplay((current) => ({ ...current, clipHeight: 1 }));
        setShowClip(false);
        if (modelId && selectedModel?.hasReadme) {
            void window.electronAPI.getModelReadme(modelId).then(setReadme);
        }
    }, [modelId, selectedModel?.hasReadme]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
            if (e.key === 'Escape' && !isEditingMetadata) closeViewer();
            if (typing || isEditingMetadata || e.metaKey || e.ctrlKey || e.altKey) return;
            switch (e.key.toLowerCase()) {
                case 'w': setDisplay((c) => ({ ...c, wireframe: !c.wireframe })); break;
                case 'g': setShowGrid((v) => !v); break;
                case 'r': controlsRef.current?.reset(); break;
                case ' ': e.preventDefault(); setAutoRotate((v) => !v); break;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [closeViewer, isEditingMetadata]);

    const handleLoadError = useCallback((message: string) => setLoadError(message), []);

    if (!selectedModel) return null;

    const handleRename = async () => {
        if (!renameValue.trim() || renameValue === selectedModel.filename) {
            setIsRenaming(false);
            return;
        }
        try {
            await window.electronAPI.renameModelFile(selectedModel.id, renameValue);
            setIsRenaming(false);
        } catch (error) {
            reportError('Could not rename the file', error);
        }
    };

    const handleToggleTag = async (tagId: number) => {
        const hasTag = selectedModel.tags.some((t) => t.id === tagId);
        if (hasTag) await removeTagFromModel(selectedModel.id, tagId);
        else await addTagToModel(selectedModel.id, tagId);
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        await useStore.getState().createTag(newTagName, newTagColor);
        setNewTagName('');
        setIsCreatingTag(false);
    };

    const handleCaptureThumbnail = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setCaptureState('saving');
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const dataUrl = canvas.toDataURL('image/png');
        try {
            await window.electronAPI.captureThumbnail(selectedModel.id, dataUrl.split(',')[1]);
            setCaptureState('saved');
            setTimeout(() => setCaptureState('idle'), 1500);
        } catch (error) {
            reportError('Could not save the thumbnail', error);
            setCaptureState('idle');
        }
    };

    const toggleCollection = async (collectionId: number, checked: boolean) => {
        try {
            if (checked) await window.electronAPI.addModelToCollection(selectedModel.id, collectionId);
            else await window.electronAPI.removeModelFromCollection(selectedModel.id, collectionId);
            await loadModels();
        } catch (error) {
            reportError('Could not update the collection', error);
        }
    };

    const meta = selectedModel.sourceMetadata;
    const print = selectedModel.printMeta;
    const userCollections = collections.filter((c) => c.type === 'collection');
    const missing = Boolean(selectedModel.missingSince);
    const defaultSlicer = slicers.find((s) => s.isDefault) ?? slicers[0];

    const launchSlicer = async (slicerId?: string) => {
        setSlicerMenuOpen(false);
        setSlicerError(null);
        const error = await openInSlicer(selectedModel.filepath, slicerId);
        if (error) setSlicerError(error);
    };

    return (
        <div
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) closeViewer();
            }}
        >
            <div className="bg-primary-card rounded-xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden border border-accent-gray shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-accent-gray flex-shrink-0 bg-primary-card">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-semibold truncate">{selectedModel.displayName || selectedModel.filename}</h2>
                        <p className="text-sm text-text-secondary mt-0.5 truncate">
                            {formatFileSize(selectedModel.fileSize)} · {selectedModel.fileType.toUpperCase()}
                            {selectedModel.triangleCount !== undefined && ` · ${formatTriangles(selectedModel.triangleCount)}`}
                            {selectedModel.bbox && ` · ${formatDimensions(selectedModel.bbox)}`}
                        </p>
                    </div>
                    <button onClick={closeViewer} className="ml-4 p-2 hover:bg-primary-hover rounded-lg transition-colors flex-shrink-0" title="Close (Esc)">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* 3D viewer */}
                    <div className="flex-1 bg-primary-bg relative min-w-0">
                        {missing ? (
                            <div className="absolute inset-0 flex items-center justify-center p-8">
                                <div className="max-w-md text-center space-y-3">
                                    <div className="w-16 h-16 mx-auto rounded-2xl bg-primary-card flex items-center justify-center">
                                        <FileX size={32} className="text-red-400" />
                                    </div>
                                    <div className="text-text-primary font-medium">File not available</div>
                                    <div className="text-sm text-text-secondary">
                                        Not found since {new Date(selectedModel.missingSince!).toLocaleString()}. If it lives on an external drive,
                                        plug the drive back in and it will reappear automatically. Tags, notes and collections are kept.
                                    </div>
                                </div>
                            </div>
                        ) : (
                        <Canvas
                            ref={canvasRef}
                            shadows
                            camera={{ position: [6, 5, 7], fov: 45 }}
                            gl={{ preserveDrawingBuffer: true, powerPreference: 'high-performance', localClippingEnabled: true }}
                        >
                            <Stage environment="city" intensity={0.6} adjustCamera={false}>
                                {showGrid && (
                                    <Grid
                                        args={[20, 20]}
                                        cellSize={0.5}
                                        cellThickness={0.6}
                                        cellColor="#404040"
                                        sectionSize={2}
                                        sectionThickness={1}
                                        sectionColor="#505050"
                                        fadeDistance={30}
                                        fadeStrength={1}
                                        followCamera={false}
                                        position={[0, -0.01, 0]}
                                    />
                                )}
                                <GenericModel
                                    key={selectedModel.id}
                                    filepath={selectedModel.filepath}
                                    fileType={selectedModel.fileType}
                                    options={display}
                                    onError={handleLoadError}
                                />
                            </Stage>
                            <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.05} minDistance={1} maxDistance={30} makeDefault autoRotate={autoRotate} autoRotateSpeed={0.5} />
                        </Canvas>
                        )}

                        {!missing && (
                            <div className="absolute top-4 left-4 flex flex-col gap-2" data-testid="viewer-tools">
                                <div className="glass rounded-lg p-1 flex items-center gap-0.5">
                                    {([
                                        { key: 'rotate', icon: <RotateCw size={16} />, active: autoRotate, title: 'Auto-rotate (Space)', onClick: () => setAutoRotate((v) => !v) },
                                        { key: 'wireframe', icon: <Box size={16} />, active: display.wireframe, title: 'Wireframe (W)', onClick: () => updateDisplay({ wireframe: !display.wireframe }) },
                                        { key: 'grid', icon: <Grid3x3 size={16} />, active: showGrid, title: 'Grid (G)', onClick: () => setShowGrid((v) => !v) },
                                        { key: 'clip', icon: <Scissors size={16} />, active: showClip || display.clipHeight < 1, title: 'Section view', onClick: () => setShowClip((v) => !v) },
                                        { key: 'reset', icon: <Maximize2 size={16} />, active: false, title: 'Reset view (R)', onClick: () => controlsRef.current?.reset() },
                                    ] as const).map((tool) => (
                                        <button
                                            key={tool.key}
                                            onClick={tool.onClick}
                                            title={tool.title}
                                            aria-label={tool.title}
                                            aria-pressed={tool.active}
                                            className={`p-2 rounded-md transition-colors ${tool.active ? 'bg-accent-blue text-white' : 'text-white/80 hover:bg-white/20'}`}
                                        >
                                            {tool.icon}
                                        </button>
                                    ))}
                                    <label className="p-2 rounded-md text-white/80 hover:bg-white/20 cursor-pointer flex items-center" title="Model colour">
                                        <Palette size={16} />
                                        <input
                                            type="color"
                                            value={display.uniformColor}
                                            onChange={(e) => updateDisplay({ uniformColor: e.target.value, fileColors: false })}
                                            className="w-0 h-0 opacity-0 absolute"
                                            aria-label="Model colour"
                                        />
                                    </label>
                                    {selectedModel.fileType === '3mf' && (
                                        <button
                                            onClick={() => updateDisplay({ fileColors: !display.fileColors })}
                                            title={display.fileColors ? 'Showing colours from the file' : 'Show colours from the file'}
                                            aria-pressed={display.fileColors}
                                            className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${display.fileColors ? 'bg-accent-blue text-white' : 'text-white/80 hover:bg-white/20'}`}
                                        >
                                            File colours
                                        </button>
                                    )}
                                </div>
                                {showClip && (
                                    <div className="glass rounded-lg px-3 py-2 flex items-center gap-3 text-xs text-white/90">
                                        <span className="whitespace-nowrap">Section height</span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={Math.round(display.clipHeight * 100)}
                                            onChange={(e) => updateDisplay({ clipHeight: Number(e.target.value) / 100 })}
                                            className="w-40 accent-blue-500"
                                            aria-label="Section height"
                                        />
                                        <span className="tabular-nums w-10 text-right">{Math.round(display.clipHeight * 100)}%</span>
                                        {selectedModel.bbox && (
                                            <span className="text-white/60 tabular-nums">≈ {(selectedModel.bbox.z * display.clipHeight).toFixed(1)} mm</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {loadError && (
                            <div className="absolute inset-x-0 top-4 flex justify-center pointer-events-none">
                                <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 text-red-200 text-sm px-4 py-2 rounded-lg">
                                    <AlertTriangle size={16} />
                                    {loadError}
                                </div>
                            </div>
                        )}

                        {!missing && (
                        <button
                            onClick={handleCaptureThumbnail}
                            disabled={captureState === 'saving'}
                            className="absolute top-4 right-4 glass px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors flex items-center gap-2 disabled:opacity-60"
                            title="Use the current view as the thumbnail"
                        >
                            <Camera size={18} />
                            {captureState === 'saved' ? 'Saved' : captureState === 'saving' ? 'Saving…' : 'Capture Thumbnail'}
                        </button>
                        )}
                    </div>

                    {/* Side panel */}
                    <div className="w-80 bg-primary-card border-l border-accent-gray flex flex-col overflow-hidden flex-shrink-0">
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {/* File */}
                            <section>
                                <h3 className="text-sm font-semibold mb-3 text-text-primary">File</h3>
                                <div className="space-y-3">
                                    <div>
                                        <div className="text-text-secondary text-xs mb-1">Filename</div>
                                        <input
                                            className="w-full bg-primary-bg text-text-primary px-3 py-2 rounded-lg border border-transparent focus:border-blue-500 focus:outline-none transition-colors text-sm"
                                            value={isRenaming ? renameValue : selectedModel.filename}
                                            onChange={(e) => {
                                                setIsRenaming(true);
                                                setRenameValue(e.target.value);
                                            }}
                                            onBlur={() => isRenaming && handleRename()}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') e.currentTarget.blur();
                                                if (e.key === 'Escape') {
                                                    e.stopPropagation();
                                                    setIsRenaming(false);
                                                    setRenameValue('');
                                                }
                                            }}
                                            title={missing ? 'Cannot rename a missing file' : 'Click to rename'}
                                            readOnly={missing}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Size">{formatFileSize(selectedModel.fileSize)}</Field>
                                        <Field label="Type"><span className="uppercase">{selectedModel.fileType}</span></Field>
                                    </div>
                                    <Field label="Location"><span className="text-xs font-mono break-all">{selectedModel.filepath}</span></Field>
                                </div>
                            </section>

                            {/* Geometry */}
                            {(selectedModel.bbox || selectedModel.triangleCount !== undefined) && (
                                <section>
                                    <h3 className="text-sm font-semibold mb-3 text-text-primary">Geometry</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {selectedModel.bbox && <Field label="Dimensions">{formatDimensions(selectedModel.bbox)}</Field>}
                                        {selectedModel.triangleCount !== undefined && <Field label="Triangles">{selectedModel.triangleCount.toLocaleString()}</Field>}
                                        {selectedModel.volumeMm3 !== undefined && <Field label="Volume">{formatVolume(selectedModel.volumeMm3)}</Field>}
                                    </div>
                                </section>
                            )}

                            {/* Print settings from slicer project */}
                            {print && (print.slicer || print.printerModel || print.filamentTypes?.length || print.layerHeight || print.title || print.designer) && (
                                <section>
                                    <h3 className="text-sm font-semibold mb-3 text-text-primary">Project</h3>
                                    <div className="space-y-3">
                                        {print.title && <Field label="Title">{print.title}</Field>}
                                        {print.designer && <Field label="Designer">{print.designer}</Field>}
                                        {print.description && <Field label="Description"><span className="text-xs whitespace-pre-wrap">{print.description}</span></Field>}
                                        <div className="grid grid-cols-2 gap-3">
                                            {print.slicer && <Field label="Slicer">{print.slicer}</Field>}
                                            {print.printerModel && <Field label="Printer">{print.printerModel}</Field>}
                                            {print.filamentTypes && print.filamentTypes.length > 0 && <Field label="Filament">{print.filamentTypes.join(', ')}</Field>}
                                            {print.layerHeight !== undefined && !Number.isNaN(print.layerHeight) && <Field label="Layer height">{print.layerHeight} mm</Field>}
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Source metadata */}
                            <section>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-text-primary">Source</h3>
                                    <button onClick={() => setIsEditingMetadata(true)} className="text-xs text-accent-blue hover:underline flex items-center gap-1">
                                        <Pencil size={12} /> Edit
                                    </button>
                                </div>
                                {meta && (meta.source || meta.author || meta.license || meta.url || meta.notes) ? (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            {meta.source && <Field label="Site">{meta.source}</Field>}
                                            {meta.author && <Field label="Author">{meta.author}</Field>}
                                            {meta.license && <Field label="License">{meta.license}</Field>}
                                        </div>
                                        {meta.url && (
                                            <Field label="URL">
                                                <a href={meta.url} target="_blank" rel="noreferrer" className="text-accent-blue hover:underline text-xs break-all">{meta.url}</a>
                                            </Field>
                                        )}
                                        {meta.notes && <Field label="Notes"><span className="text-xs whitespace-pre-wrap">{meta.notes}</span></Field>}
                                    </div>
                                ) : (
                                    <div className="text-text-secondary text-xs italic">No source information yet.</div>
                                )}
                            </section>

                            {/* README */}
                            {selectedModel.hasReadme && (
                                <section>
                                    <button onClick={() => setReadmeOpen((v) => !v)} className="w-full flex items-center gap-2 text-sm font-semibold text-text-primary mb-2">
                                        {readmeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <FileText size={14} /> README
                                    </button>
                                    {readmeOpen && (
                                        <pre className="text-xs text-text-primary bg-primary-bg rounded-lg p-3 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-sans">
                                            {readme ?? 'Loading…'}
                                        </pre>
                                    )}
                                </section>
                            )}

                            {/* Collections */}
                            <section>
                                <h3 className="text-sm font-semibold mb-3 text-text-primary">Collections</h3>
                                <div className="bg-primary-bg rounded-lg border border-accent-gray p-2 max-h-40 overflow-y-auto space-y-1">
                                    {userCollections.map((c) => (
                                        <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-primary-hover rounded cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={selectedModel.collectionIds.includes(c.id)}
                                                className="w-4 h-4 rounded accent-blue-500"
                                                onChange={(e) => toggleCollection(c.id, e.target.checked)}
                                            />
                                            <span className="text-text-primary text-sm">{c.name}</span>
                                        </label>
                                    ))}
                                    {userCollections.length === 0 && (
                                        <div className="text-text-secondary text-xs text-center py-2 italic">No collections created yet.</div>
                                    )}
                                </div>
                            </section>

                            {/* Tags */}
                            <section>
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-text-primary">
                                    <TagIcon size={16} /> Tags
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {tags.map((tag) => {
                                        const isActive = selectedModel.tags.some((t) => t.id === tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                onClick={() => handleToggleTag(tag.id)}
                                                className={`tag ${isActive ? 'active' : ''}`}
                                                style={{ backgroundColor: tag.color, color: '#000', opacity: isActive ? 1 : 0.5 }}
                                            >
                                                {tag.name}
                                            </button>
                                        );
                                    })}
                                    {!isCreatingTag ? (
                                        <button
                                            onClick={() => setIsCreatingTag(true)}
                                            className="tag bg-white/10 hover:bg-white/20 text-text-secondary hover:text-text-primary transition-colors border border-dashed border-white/20"
                                        >
                                            + New Tag
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 bg-primary-bg p-1 rounded border border-accent-blue">
                                            <input
                                                autoFocus
                                                type="text"
                                                value={newTagName}
                                                onChange={(e) => setNewTagName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleCreateTag();
                                                    if (e.key === 'Escape') {
                                                        e.stopPropagation();
                                                        setIsCreatingTag(false);
                                                        setNewTagName('');
                                                    }
                                                }}
                                                placeholder="Tag name…"
                                                className="bg-transparent text-text-primary text-xs w-20 focus:outline-none"
                                            />
                                            <input
                                                type="color"
                                                value={newTagColor}
                                                onChange={(e) => setNewTagColor(e.target.value)}
                                                className="w-4 h-4 rounded cursor-pointer border-none p-0 bg-transparent"
                                                title="Choose color"
                                            />
                                            <button onClick={handleCreateTag} className="text-accent-blue hover:text-text-primary transition-colors">
                                                <Plus size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>

                        {/* Actions */}
                        <div className="p-4 border-t border-accent-gray space-y-2 flex-shrink-0 bg-primary-card">
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
                                        onClick={() => setSlicerMenuOpen((v) => !v)}
                                        className="btn btn-primary rounded-l-none border-l border-white/20 px-2 disabled:opacity-50"
                                        disabled={missing}
                                        title="Choose a slicer"
                                        aria-label="Choose a slicer"
                                    >
                                        <ChevronDown size={16} />
                                    </button>
                                </div>
                                {slicerMenuOpen && (
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
                                                setSlicerMenuOpen(false);
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
                                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {slicerError}
                                </div>
                            )}
                            <button
                                onClick={() => window.electronAPI.openFolder(selectedModel.filepath).catch((err) => console.error(err))}
                                className="btn btn-secondary w-full disabled:opacity-50"
                                disabled={missing}
                            >
                                <Folder size={16} /> Show in Folder
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {isEditingMetadata && (
                <MetadataEditor modelId={selectedModel.id} currentMetadata={meta} onClose={() => setIsEditingMetadata(false)} />
            )}
        </div>
    );
}
