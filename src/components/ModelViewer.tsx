import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Environment } from '@react-three/drei';
import { X, Tag as TagIcon, ExternalLink, Folder, Loader2 } from 'lucide-react';
import { useStore } from '../store/store';
import GenericModel from './GenericModel';

export default function ModelViewer() {
    const { selectedModel, closeViewer, tags, addTagToModel, removeTagFromModel } = useStore();

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
                        <Canvas shadows>
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

                        {/* Loading overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="flex flex-col items-center gap-3 glass px-6 py-4 rounded-xl shadow-2xl">
                                <Loader2 size={24} className="spinner w-6 h-6" />
                                <div className="text-white text-sm font-medium">Loading 3D model...</div>
                            </div>
                        </div>

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
