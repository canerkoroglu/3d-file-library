/** Collections and tags: where the user organises a model. */
import { useState } from 'react';
import { Plus, Tag as TagIcon } from 'lucide-react';
import { useStore } from '../../store/store';
import type { ModelWithTags } from '../../types';

export function CollectionsSection({ model }: { model: ModelWithTags }) {
    const { collections, loadModels, reportError } = useStore();
    const userCollections = collections.filter((c) => c.type === 'collection');

    const toggleCollection = async (collectionId: number, checked: boolean) => {
        try {
            if (checked) await window.electronAPI.addModelToCollection(model.id, collectionId);
            else await window.electronAPI.removeModelFromCollection(model.id, collectionId);
            await loadModels();
        } catch (error) {
            reportError('Could not update the collection', error);
        }
    };

    return (
        <section>
            <h3 className="text-sm font-semibold mb-3 text-text-primary">Collections</h3>
            <div className="bg-primary-bg rounded-lg border border-accent-gray p-2 max-h-40 overflow-y-auto space-y-1">
                {userCollections.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-primary-hover rounded-sm cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={model.collectionIds.includes(c.id)}
                            className="w-4 h-4 rounded-sm accent-blue-500"
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
    );
}

export function TagsSection({ model }: { model: ModelWithTags }) {
    const { tags, addTagToModel, removeTagFromModel, createTag } = useStore();
    const [isCreatingTag, setIsCreatingTag] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3b82f6');

    const handleToggleTag = async (tagId: number) => {
        const hasTag = model.tags.some((t) => t.id === tagId);
        if (hasTag) await removeTagFromModel(model.id, tagId);
        else await addTagToModel(model.id, tagId);
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        await createTag(newTagName, newTagColor);
        setNewTagName('');
        setIsCreatingTag(false);
    };

    return (
        <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-text-primary">
                <TagIcon size={16} /> Tags
            </h3>
            <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                    const isActive = model.tags.some((t) => t.id === tag.id);
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
                    <div className="flex items-center gap-2 bg-primary-bg p-1 rounded-sm border border-accent-blue">
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
                            className="bg-transparent text-text-primary text-xs w-20 focus:outline-hidden"
                        />
                        <input
                            type="color"
                            value={newTagColor}
                            onChange={(e) => setNewTagColor(e.target.value)}
                            className="w-4 h-4 rounded-sm cursor-pointer border-none p-0 bg-transparent"
                            title="Choose color"
                        />
                        <button onClick={handleCreateTag} className="text-accent-blue hover:text-text-primary transition-colors">
                            <Plus size={12} />
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
