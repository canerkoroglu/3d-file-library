import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Stage } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { AlertTriangle, Box, Camera, Grid3x3, Loader2, Maximize2, Palette, RotateCw, Scissors } from 'lucide-react';
import { useStore } from '../../store/store';
import GenericModel, { type ViewerDisplayOptions } from '../GenericModel';
import LocalEnvironment from '../LocalEnvironment';
import type { ModelWithTags } from '../../types';

interface ViewerCanvasProps {
    model: ModelWithTags;
    /** Keyboard shortcuts (W, G, R, Space) are off while a dialog such as the metadata editor is open. */
    shortcutsEnabled: boolean;
}

/** The 3D view of a model with its toolbar, loading/error overlays and thumbnail capture. */
export default function ViewerCanvas({ model, shortcutsEnabled }: ViewerCanvasProps) {
    const reportError = useStore((s) => s.reportError);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const controlsRef = useRef<OrbitControlsImpl>(null);

    // View settings carry over when switching to another model (e.g. a similar one); the section cut does not.
    const [autoRotate, setAutoRotate] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [display, setDisplay] = useState<ViewerDisplayOptions>({ wireframe: false, fileColors: true, uniformColor: '#3b82f6', clipHeight: 1 });
    const [showClip, setShowClip] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [modelReady, setModelReady] = useState(false);
    const [captureState, setCaptureState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const updateDisplay = (patch: Partial<ViewerDisplayOptions>) => setDisplay((current) => ({ ...current, ...patch }));
    const resetView = useCallback(() => controlsRef.current?.reset(), []);

    // A different model starts with a fresh status and no section cut (adjusting state during render).
    const [shownModelId, setShownModelId] = useState(model.id);
    if (model.id !== shownModelId) {
        setShownModelId(model.id);
        setLoadError(null);
        setModelReady(false);
        setCaptureState('idle');
        setDisplay((current) => ({ ...current, clipHeight: 1 }));
        setShowClip(false);
    }

    useEffect(() => {
        if (!shortcutsEnabled) return;
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
            if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
            switch (e.key.toLowerCase()) {
                case 'w': setDisplay((c) => ({ ...c, wireframe: !c.wireframe })); break;
                case 'g': setShowGrid((v) => !v); break;
                case 'r': resetView(); break;
                case ' ': e.preventDefault(); setAutoRotate((v) => !v); break;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [shortcutsEnabled, resetView]);

    const handleLoadError = useCallback((message: string) => setLoadError(message), []);
    const handleLoaded = useCallback(() => setModelReady(true), []);

    const handleCaptureThumbnail = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setCaptureState('saving');
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const dataUrl = canvas.toDataURL('image/png');
        try {
            await window.electronAPI.captureThumbnail(model.id, dataUrl.split(',')[1]);
            setCaptureState('saved');
            setTimeout(() => setCaptureState('idle'), 1500);
        } catch (error) {
            reportError('Could not save the thumbnail', error);
            setCaptureState('idle');
        }
    };

    const tools = [
        { key: 'rotate', icon: <RotateCw size={16} />, active: autoRotate, title: 'Auto-rotate (Space)', onClick: () => setAutoRotate((v) => !v) },
        { key: 'wireframe', icon: <Box size={16} />, active: display.wireframe, title: 'Wireframe (W)', onClick: () => updateDisplay({ wireframe: !display.wireframe }) },
        { key: 'grid', icon: <Grid3x3 size={16} />, active: showGrid, title: 'Grid (G)', onClick: () => setShowGrid((v) => !v) },
        { key: 'clip', icon: <Scissors size={16} />, active: showClip || display.clipHeight < 1, title: 'Section view', onClick: () => setShowClip((v) => !v) },
    ] as const;

    return (
        <>
            <Canvas
                ref={canvasRef}
                shadows
                camera={{ position: [6, 5, 7], fov: 45 }}
                gl={{ preserveDrawingBuffer: true, powerPreference: 'high-performance', localClippingEnabled: true }}
            >
                <LocalEnvironment />
                <Stage environment={null} intensity={0.6} adjustCamera={false}>
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
                        key={model.id}
                        modelId={model.id}
                        fileSize={model.fileSize}
                        fileType={model.fileType}
                        options={display}
                        onError={handleLoadError}
                        onLoaded={handleLoaded}
                    />
                </Stage>
                <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.05} minDistance={1} maxDistance={30} makeDefault autoRotate={autoRotate} autoRotateSpeed={0.5} />
            </Canvas>

            <div className="absolute top-4 left-4 flex flex-col gap-2" data-testid="viewer-tools">
                <div className="glass rounded-lg p-1 flex items-center gap-0.5">
                    {tools.map((tool) => (
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
                    <button
                        onClick={resetView}
                        title="Reset view (R)"
                        aria-label="Reset view (R)"
                        aria-pressed={false}
                        className="p-2 rounded-md transition-colors text-white/80 hover:bg-white/20"
                    >
                        <Maximize2 size={16} />
                    </button>
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
                    {model.fileType === '3mf' && (
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
                        {model.bbox && (
                            <span className="text-white/60 tabular-nums">≈ {(model.bbox.z * display.clipHeight).toFixed(1)} mm</span>
                        )}
                    </div>
                )}
            </div>

            {!loadError && !modelReady && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" data-testid="viewer-loading">
                    <div className="flex items-center gap-2 bg-black/40 text-white/80 text-sm px-4 py-2 rounded-lg">
                        <Loader2 size={16} className="animate-spin" />
                        Loading model…
                    </div>
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

            <button
                onClick={handleCaptureThumbnail}
                disabled={captureState === 'saving'}
                className="absolute top-4 right-4 glass px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors flex items-center gap-2 disabled:opacity-60"
                title="Use the current view as the thumbnail"
            >
                <Camera size={18} />
                {captureState === 'saved' ? 'Saved' : captureState === 'saving' ? 'Saving…' : 'Capture Thumbnail'}
            </button>
        </>
    );
}
