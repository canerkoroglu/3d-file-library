import { useEffect, useRef, useState } from 'react';
import { Trash2, Tag, X, ChevronUp, FolderPlus, CheckSquare, TagIcon } from 'lucide-react';
import { useStore } from '../store/store';
import { ConfirmDialog } from './ConfirmDialog';

type MenuKind = 'addTag' | 'removeTag' | 'collection';

export default function BulkActionsBar() {
    const {
        selectedModels, selectionMode, models, totalModels,
        clearSelection, selectAllModels,
        bulkDelete, bulkAddTag, bulkRemoveTag, bulkAddToCollection,
        tags, collections,
    } = useStore();
    const [openMenu, setOpenMenu] = useState<MenuKind | null>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);

    const selectedCount = selectedModels.size;
    const visible = selectedCount > 0 || selectionMode;

    // Close menus when clicking elsewhere.
    useEffect(() => {
        if (!openMenu) return;
        const onMouseDown = (e: MouseEvent) => {
            if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [openMenu]);

    useEffect(() => {
        if (!visible) setOpenMenu(null);
    }, [visible]);

    if (!visible) return null;

    const userCollections = collections.filter((c) => c.type === 'collection');
    const selectedList = models.filter((m) => selectedModels.has(m.id));
    const tagsOnSelection = tags.filter((t) => selectedList.some((m) => m.tags.some((mt) => mt.id === t.id)));
    const allLoadedSelected = models.length > 0 && selectedCount >= models.length;

    const menuButton = (kind: MenuKind, label: string, icon: React.ReactNode, disabled = false) => (
        <button
            onClick={() => setOpenMenu((current) => (current === kind ? null : kind))}
            disabled={disabled || selectedCount === 0}
            className={`btn btn-secondary h-9 text-sm px-3 disabled:opacity-40 ${openMenu === kind ? 'border-accent-blue' : ''}`}
        >
            {icon}
            <span>{label}</span>
            <ChevronUp size={14} className={`transition-transform ${openMenu === kind ? '' : 'rotate-180'}`} />
        </button>
    );

    const menu = (items: Array<{ key: number; label: string; color?: string; onSelect: () => void }>, empty: string) => (
        <div className="absolute bottom-full left-0 mb-2 min-w-[200px] max-h-72 overflow-y-auto bg-primary-card border border-accent-gray rounded-lg shadow-2xl p-1 z-50">
            {items.length === 0 && <div className="px-3 py-2 text-xs text-text-secondary italic">{empty}</div>}
            {items.map((item) => (
                <button
                    key={item.key}
                    onClick={() => {
                        setOpenMenu(null);
                        item.onSelect();
                    }}
                    className="w-full text-left px-3 py-2 rounded hover:bg-primary-hover transition-colors flex items-center gap-2 text-sm text-text-primary"
                >
                    {item.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />}
                    <span className="truncate">{item.label}</span>
                </button>
            ))}
        </div>
    );

    return (
        <>
            <ConfirmDialog
                isOpen={confirmRemove}
                title="Remove from library"
                message={`Remove ${selectedCount} model${selectedCount === 1 ? '' : 's'} from the library? Tags and notes for them are lost. The files on disk are not touched; if they are in a watched folder they will be re-imported on the next sync.`}
                confirmLabel="Remove"
                isDestructive
                onConfirm={() => {
                    setConfirmRemove(false);
                    void bulkDelete();
                }}
                onCancel={() => setConfirmRemove(false)}
            />

            <div
                ref={barRef}
                className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-primary-card border border-accent-gray rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 z-40 animate-slide-up"
            >
                <div className="flex items-center gap-2 pr-3 border-r border-accent-gray">
                    <div className="min-w-6 h-6 px-1.5 bg-accent-blue rounded flex items-center justify-center">
                        <span className="text-xs font-bold text-white tabular-nums">{selectedCount}</span>
                    </div>
                    <span className="text-sm font-medium text-text-primary whitespace-nowrap">selected</span>
                    {!allLoadedSelected && (
                        <button onClick={selectAllModels} className="text-xs text-accent-blue hover:underline whitespace-nowrap flex items-center gap-1" title="Select every loaded model">
                            <CheckSquare size={12} /> Select all {models.length < totalModels ? `${models.length} loaded` : ''}
                        </button>
                    )}
                </div>

                <div className="relative">
                    {menuButton('addTag', 'Add tag', <Tag size={16} />)}
                    {openMenu === 'addTag' && menu(
                        tags.map((t) => ({ key: t.id, label: t.name, color: t.color, onSelect: () => void bulkAddTag(t.id) })),
                        'No tags yet',
                    )}
                </div>

                <div className="relative">
                    {menuButton('removeTag', 'Remove tag', <TagIcon size={16} />, tagsOnSelection.length === 0)}
                    {openMenu === 'removeTag' && menu(
                        tagsOnSelection.map((t) => ({ key: t.id, label: t.name, color: t.color, onSelect: () => void bulkRemoveTag(t.id) })),
                        'Selected models have no tags',
                    )}
                </div>

                <div className="relative">
                    {menuButton('collection', 'Add to collection', <FolderPlus size={16} />)}
                    {openMenu === 'collection' && menu(
                        userCollections.map((c) => ({ key: c.id, label: c.name, onSelect: () => void bulkAddToCollection(c.id) })),
                        'Create a collection in the sidebar first',
                    )}
                </div>

                <button
                    onClick={() => setConfirmRemove(true)}
                    disabled={selectedCount === 0}
                    className="btn h-9 text-sm px-3 bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 disabled:opacity-40"
                >
                    <Trash2 size={16} />
                    <span>Remove</span>
                </button>

                <div className="w-px h-6 bg-accent-gray" />

                <button onClick={clearSelection} className="btn btn-ghost h-9 w-9 p-0" title="Clear selection (Esc)">
                    <X size={18} />
                </button>
            </div>
        </>
    );
}
