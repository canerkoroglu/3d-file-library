import { Suspense, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Environment } from '@react-three/drei';
import { X, Tag as TagIcon, ExternalLink, Folder, Camera, Plus } from 'lucide-react';
import { useStore } from '../store/store';
import GenericModel from './GenericModel';

export default function ModelViewer() {
    const { selectedModel, closeViewer, tags, addTagToModel, removeTagFromModel } = useStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    if (!selectedModel) return null;

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const handleToggleTag = async (tagId: number) => {
        const hasTag = selectedModel.tags?.some(t => t.id === tagId);
        if (hasTag) {
            await removeTagFromModel(selectedModel.id, tagId);
        } else {
            await addTagToModel(selectedModel.id, tagId);
        }
    };

    // Tag Creation State
    const [isCreatingTag, setIsCreatingTag] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3b82f6');

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        try {
            const { createTag } = useStore.getState();
            await createTag(newTagName, newTagColor);

            // Should verify if we need to manually assign it or if just creating it is enough
            // For now, let's just create it. The store will reload tags.

            setNewTagName('');
            setIsCreatingTag(false);
            // newTagColor remains as last used, or reset if desired
        } catch (error) {
            console.error('Failed to create tag:', error);
        }
    };

    const handleCaptureThumbnail = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            // Wait for next frame to ensure scene is fully rendered
            await new Promise(resolve => requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            }));

            // Convert canvas to blob
            canvas.toBlob(async (blob) => {
                if (!blob) return;

                // Convert blob to base64
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64data = reader.result as string;
                    const base64Image = base64data.split(',')[1]; // Remove data:image/png;base64, prefix

                    // Send to main process to save
                    console.log('Sending thumbnail to main process for model:', selectedModel.id);
                    await window.electronAPI.captureThumbnail(selectedModel.id, base64Image);
                    console.log('Thumbnail saved, reloading models...');

                    // Reload models to show updated thumbnail
                    const { loadModels, closeViewer } = useStore.getState();
                    await loadModels();

                    // Close viewer to force grid refresh
                    closeViewer();

                    // Show success feedback
                    console.log('Thumbnail captured and updated successfully! Models reloaded.');
                };
                reader.readAsDataURL(blob);
            }, 'image/png');
        } catch (error) {
            console.error('Failed to capture thumbnail:', error);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) closeViewer();
            }}
        >
            <div className="bg-[#2d2d2d] rounded-xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden border border-[#505050] shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[#404040] flex-shrink-0 bg-[#2d2d2d]">
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-semibold truncate">{selectedModel.displayName || selectedModel.filename}</h2>
                        <p className="text-sm text-[#808080] mt-0.5">
                            {formatFileSize(selectedModel.fileSize)} • {selectedModel.fileType.toUpperCase()}
                        </p>
                    </div>
                    <button
                        onClick={closeViewer}
                        className="ml-4 p-2 hover:bg-[#353535] rounded-lg transition-colors flex-shrink-0"
                        title="Close (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* 3D Viewer */}
                    <div className="flex-1 bg-[#1a1a1a] relative min-w-0">
                        <Canvas
                            shadows
                            ref={canvasRef as any}
                            gl={{ preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
                        >
                            <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
                            <OrbitControls
                                enableDamping
                                dampingFactor={0.05}
                                minDistance={1}
                                maxDistance={20}
                                makeDefault
                            />

                            {/* Lighting */}
                            <ambientLight intensity={0.4} />
                            <directionalLight
                                position={[10, 10, 5]}
                                intensity={0.8}
                                castShadow
                                shadow-mapSize={[1024, 1024]}
                            />
                            <directionalLight position={[-10, -10, -5]} intensity={0.3} />
                            <spotLight position={[0, 10, 0]} intensity={0.3} angle={0.6} penumbra={1} />

                            {/* Environment for better reflections */}
                            <Environment preset="city" />

                            {/* Grid */}
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

                            {/* 3D Model */}
                            <Suspense fallback={null}>
                                {selectedModel && (
                                    <GenericModel
                                        filepath={selectedModel.filepath}
                                        fileType={selectedModel.fileType}
                                    />
                                )}
                            </Suspense>
                        </Canvas>

                        {/* Capture Thumbnail Button */}
                        <button
                            onClick={handleCaptureThumbnail}
                            className="absolute top-4 right-4 glass px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors flex items-center gap-2"
                            title="Capture current view as thumbnail"
                        >
                            <Camera size={18} />
                            Capture Thumbnail
                        </button>

                        {/* Controls hint */}
                        <div className="absolute bottom-4 left-4 glass px-4 py-2 rounded-lg text-xs text-white/90 pointer-events-none">
                            <div className="font-semibold mb-1">Controls:</div>
                            <div>Left click + drag: Rotate</div>
                            <div>Right click + drag: Pan</div>
                            <div>Scroll: Zoom</div>
                        </div>
                    </div>

                    {/* Side panel */}
                    <div className="w-80 bg-[#2d2d2d] border-l border-[#404040] flex flex-col overflow-hidden flex-shrink-0">
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {/* Model info */}
                            <div>
                                <h3 className="text-sm font-semibold mb-3 text-white">Model Information</h3>
                                <div className="space-y-3 text-sm">
                                    {/* ... existing info fields ... */}
                                    <div>
                                        <div className="text-[#808080] text-xs mb-1">Filename</div>
                                        <div className="text-white break-all bg-[#1a1a1a] px-3 py-2 rounded-lg">{selectedModel.filename}</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <div className="text-[#808080] text-xs mb-1">Size</div>
                                            <div className="text-white bg-[#1a1a1a] px-3 py-2 rounded-lg">{formatFileSize(selectedModel.fileSize)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[#808080] text-xs mb-1">Type</div>
                                            <div className="text-white bg-[#1a1a1a] px-3 py-2 rounded-lg uppercase">{selectedModel.fileType}</div>
                                        </div>
                                    </div>

                                    {/* Collection Assignment */}
                                    <div>
                                        <div className="text-[#808080] text-xs mb-2">Collections</div>
                                        <div className="bg-[#1a1a1a] rounded-lg border border-[#404040] p-2 max-h-40 overflow-y-auto space-y-1">
                                            {useStore.getState().collections
                                                .filter(c => c.type === 'collection')
                                                .map(c => {
                                                    const isChecked = selectedModel.collectionIds?.includes(c.id);
                                                    return (
                                                        <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#252525] rounded cursor-pointer group select-none">
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked || false}
                                                                className="w-4 h-4 rounded border-gray-600 bg-[#2d2d2d] text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900 accent-blue-500"
                                                                onChange={async (e) => {
                                                                    const checked = e.target.checked;
                                                                    console.log(`Toggling collection ${c.name} (ID: ${c.id}) to ${checked}`);

                                                                    // Optimistic UI update could be added here, but for now we rely on store refresh
                                                                    try {
                                                                        if (checked) {
                                                                            await window.electronAPI.addModelToCollection(selectedModel.id, c.id);
                                                                        } else {
                                                                            await window.electronAPI.removeModelFromCollection(selectedModel.id, c.id);
                                                                        }
                                                                        // Refresh model data
                                                                        const { loadModels } = useStore.getState();
                                                                        await loadModels();
                                                                    } catch (error) {
                                                                        console.error('Failed to update collection:', error);
                                                                    }
                                                                }}
                                                            />
                                                            <span className="text-white text-sm">{c.name}</span>
                                                        </label>
                                                    );
                                                })
                                            }
                                            {useStore.getState().collections.filter(c => c.type === 'collection').length === 0 && (
                                                <div className="text-[#606060] text-xs text-center py-2 italic">
                                                    No collections created yet.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="text-[#808080] text-xs mb-1">Location</div>
                                        <div className="text-white text-xs break-all bg-[#1a1a1a] px-3 py-2 rounded-lg font-mono">
                                            {selectedModel.filepath}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tags */}
                            <div>
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-white">
                                    <TagIcon size={16} />
                                    Tags
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {tags.map((tag) => {
                                        const isActive = selectedModel.tags?.some(t => t.id === tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                onClick={() => handleToggleTag(tag.id)}
                                                className={`tag ${isActive ? 'active' : ''}`}
                                                style={{
                                                    backgroundColor: tag.color,
                                                    color: '#000',
                                                    opacity: isActive ? 1 : 0.5,
                                                }}
                                            >
                                                {tag.name}
                                            </button>
                                        );
                                    })}

                                    {/* New Tag Button */}
                                    {!isCreatingTag ? (
                                        <button
                                            onClick={() => setIsCreatingTag(true)}
                                            className="tag bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-colors border border-dashed border-white/20"
                                        >
                                            + New Tag
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 bg-[#1a1a1a] p-1 rounded border border-[#3b82f6]">
                                            <input
                                                autoFocus
                                                type="text"
                                                value={newTagName}
                                                onChange={(e) => setNewTagName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleCreateTag();
                                                    if (e.key === 'Escape') {
                                                        setIsCreatingTag(false);
                                                        setNewTagName('');
                                                    }
                                                }}
                                                placeholder="Tag name..."
                                                className="bg-transparent text-white text-xs w-20 focus:outline-none"
                                            />
                                            <input
                                                type="color"
                                                value={newTagColor}
                                                onChange={(e) => setNewTagColor(e.target.value)}
                                                className="w-4 h-4 rounded cursor-pointer border-none p-0 bg-transparent"
                                                title="Choose color"
                                            />
                                            <button
                                                onClick={handleCreateTag}
                                                className="text-[#3b82f6] hover:text-white transition-colors"
                                            >
                                                <Plus size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Actions - Fixed at bottom */}
                        <div className="p-4 border-t border-[#404040] space-y-2 flex-shrink-0 bg-[#2d2d2d]">
                            <button className="btn btn-primary w-full">
                                <ExternalLink size={16} />
                                Open in Slicer
                            </button>
                            <button className="btn btn-secondary w-full">
                                <Folder size={16} />
                                Show in Folder
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
