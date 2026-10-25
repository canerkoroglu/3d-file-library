import { useEffect, useState } from 'react';
import { FileX, X } from 'lucide-react';
import { useStore } from '../store/store';
import MetadataEditor from './MetadataEditor';
import ViewerCanvas from './viewer/ViewerCanvas';
import ViewerActions from './viewer/ViewerActions';
import AiSection from './viewer/AiSection';
import { FileSection, GeometrySection, ProjectSection, SourceSection } from './viewer/InfoSections';
import { CollectionsSection, TagsSection } from './viewer/OrganizeSections';
import { ReadmeSection, SimilarSection } from './viewer/RelatedSections';
import { formatDimensions, formatFileSize, formatTriangles } from '../lib/format';

/**
 * Full-screen model viewer: the 3D view on the left, details and actions on the right.
 * The side-panel sections are keyed by model, so their local state (rename field, new-tag
 * form, README, slicer menu…) starts fresh when another model is opened.
 */
export default function ModelViewer() {
    const selectedModel = useStore((s) => s.selectedModel);
    const closeViewer = useStore((s) => s.closeViewer);
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isEditingMetadata) closeViewer();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [closeViewer, isEditingMetadata]);

    if (!selectedModel) return null;
    const missing = Boolean(selectedModel.missingSince);
    const key = selectedModel.id;

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
                            <ViewerCanvas model={selectedModel} shortcutsEnabled={!isEditingMetadata} />
                        )}
                    </div>

                    {/* Side panel */}
                    <div className="w-80 bg-primary-card border-l border-accent-gray flex flex-col overflow-hidden flex-shrink-0">
                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            <FileSection key={`file-${key}`} model={selectedModel} missing={missing} />
                            <GeometrySection model={selectedModel} />
                            <ProjectSection model={selectedModel} />
                            <SourceSection model={selectedModel} onEdit={() => setIsEditingMetadata(true)} />
                            <AiSection model={selectedModel} missing={missing} />
                            <SimilarSection key={`similar-${key}`} model={selectedModel} />
                            <ReadmeSection key={`readme-${key}`} model={selectedModel} />
                            <CollectionsSection model={selectedModel} />
                            <TagsSection key={`tags-${key}`} model={selectedModel} />
                        </div>
                        <ViewerActions key={`actions-${key}`} model={selectedModel} missing={missing} />
                    </div>
                </div>
            </div>

            {isEditingMetadata && (
                <MetadataEditor modelId={selectedModel.id} currentMetadata={selectedModel.sourceMetadata} onClose={() => setIsEditingMetadata(false)} />
            )}
        </div>
    );
}
