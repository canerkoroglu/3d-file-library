import { X, Globe, User, FileText, Link as LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/store';

interface MetadataEditorProps {
    modelId: number;
    currentMetadata?: SourceMetadata | null;
    onClose: () => void;
}

export interface SourceMetadata {
    source?: string;
    url?: string;
    author?: string;
    license?: string;
    notes?: string;
}

const SOURCE_OPTIONS = [
    'Thingiverse',
    'Printables',
    'MyMiniFactory',
    'Cults3D',
    'Thangs',
    'Custom'
];

const LICENSE_OPTIONS = [
    'CC BY 4.0',
    'CC BY-SA 4.0',
    'CC BY-NC 4.0',
    'CC BY-NC-SA 4.0',
    'CC0 (Public Domain)',
    'GPL',
    'MIT',
    'Custom'
];

export default function MetadataEditor({ modelId, currentMetadata, onClose }: MetadataEditorProps) {
    const [metadata, setMetadata] = useState<SourceMetadata>(currentMetadata || {});
    const { loadModels } = useStore();

    const handleSave = async () => {
        try {
            await window.electronAPI.updateModelMetadata(modelId, metadata);
            await loadModels();
            onClose();
        } catch (error) {
            console.error('Failed to update metadata:', error);
            alert('Failed to save metadata');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#2d2d2d] rounded-xl border border-[#404040] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-[#404040] flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Edit Source Metadata</h2>
                    <button
                        onClick={onClose}
                        className="btn btn-ghost w-8 h-8 p-0"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Source */}
                    <div>
                        <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                            <Globe size={16} className="text-[#808080]" />
                            Source
                        </label>
                        <select
                            value={metadata.source || ''}
                            onChange={(e) => setMetadata({ ...metadata, source: e.target.value })}
                            className="input w-full"
                        >
                            <option value="">Select source...</option>
                            {SOURCE_OPTIONS.map(source => (
                                <option key={source} value={source}>{source}</option>
                            ))}
                        </select>
                    </div>

                    {/* URL */}
                    <div>
                        <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                            <LinkIcon size={16} className="text-[#808080]" />
                            URL
                        </label>
                        <input
                            type="url"
                            value={metadata.url || ''}
                            onChange={(e) => setMetadata({ ...metadata, url: e.target.value })}
                            placeholder="https://..."
                            className="input w-full"
                        />
                    </div>

                    {/* Author */}
                    <div>
                        <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                            <User size={16} className="text-[#808080]" />
                            Author
                        </label>
                        <input
                            type="text"
                            value={metadata.author || ''}
                            onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                            placeholder="Creator name..."
                            className="input w-full"
                        />
                    </div>

                    {/* License */}
                    <div>
                        <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                            <FileText size={16} className="text-[#808080]" />
                            License
                        </label>
                        <select
                            value={metadata.license || ''}
                            onChange={(e) => setMetadata({ ...metadata, license: e.target.value })}
                            className="input w-full"
                        >
                            <option value="">Select license...</option>
                            {LICENSE_OPTIONS.map(license => (
                                <option key={license} value={license}>{license}</option>
                            ))}
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Notes
                        </label>
                        <textarea
                            value={metadata.notes || ''}
                            onChange={(e) => setMetadata({ ...metadata, notes: e.target.value })}
                            placeholder="Additional information, modifications, print settings..."
                            className="input w-full h-32 resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[#404040] flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="btn btn-primary"
                    >
                        Save Metadata
                    </button>
                </div>
            </div>
        </div>
    );
}
