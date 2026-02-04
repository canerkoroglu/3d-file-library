import { useStore } from '../store/store';
import ModelCard from './ModelCard';
import { Loader2, FolderX } from 'lucide-react';

export default function ModelGrid() {
    const { models, isLoading, viewMode } = useStore();

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#1a1a1a]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="spinner w-8 h-8" />
                    <div className="text-[#808080] text-sm">Loading models...</div>
                </div>
            </div>
        );
    }

    if (models.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#1a1a1a]">
                <div className="flex flex-col items-center gap-4 max-w-md text-center">
                    <div className="w-20 h-20 bg-[#2d2d2d] rounded-2xl flex items-center justify-center">
                        <FolderX size={40} className="text-[#606060]" />
                    </div>
                    <div>
                        <div className="text-white font-medium mb-2">No models found</div>
                        <div className="text-sm text-[#808080]">
                            Import some 3D files (STL, 3MF, OBJ) to get started
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-[#1a1a1a] p-5">
            <div className={
                viewMode === 'grid'
                    ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4'
                    : 'flex flex-col gap-2 max-w-5xl'
            }>
                {models.map((model) => (
                    <ModelCard key={model.id} model={model} viewMode={viewMode} />
                ))}
            </div>
        </div>
    );
}
