import { useState } from 'react';
import { Search, Grid, List, HelpCircle, X, CheckSquare, Sparkles, Loader2 } from 'lucide-react';
import { useStore } from '../store/store';
import type { SortBy, SortOrder } from '../types';

const SORT_OPTIONS: Array<{ value: `${SortBy}-${SortOrder}`; label: string }> = [
    { value: 'relevance-desc', label: 'Best Match' },
    { value: 'created-desc', label: 'Newest First' },
    { value: 'created-asc', label: 'Oldest First' },
    { value: 'name-asc', label: 'Name A-Z' },
    { value: 'name-desc', label: 'Name Z-A' },
    { value: 'size-desc', label: 'Largest File' },
    { value: 'size-asc', label: 'Smallest File' },
    { value: 'triangles-desc', label: 'Most Detailed' },
    { value: 'triangles-asc', label: 'Least Detailed' },
    { value: 'modified-desc', label: 'Recently Modified' },
    { value: 'modified-asc', label: 'Least Recently Modified' },
];

const SYNTAX_HELP: Array<[string, string]> = [
    ['benchy hull', 'words match names, folders, tags, notes and READMEs'],
    ['tag:printed', 'has the tag (repeat for several)'],
    ['type:3mf', 'file type: stl, 3mf or obj'],
    ['source:printables', 'source site from metadata'],
    ['author:name', 'author or designer'],
    ['license:cc-by', 'license from metadata or LICENSE file'],
    ['tris:>100k', 'triangle count above or below a value'],
    ['size:<50', 'largest dimension in mm'],
    ['has:readme', 'has a README beside it'],
    ['has:thumbnail', 'has a preview image'],
    ['is:missing', 'file cannot be found (deleted or drive unplugged)'],
    ['category:kitchen', 'category assigned by the AI assistant'],
    ['added:>7d', 'added in the last week (d, w, m, y, or a date)'],
];

export default function FilterBar() {
    const {
        searchQuery, setSearchQuery,
        viewMode, setViewMode,
        tags, selectedTags, toggleTag,
        sortBy, sortOrder, setSortBy, setSortOrder,
        totalModels,
        selectionMode, selectedModels, setSelectionMode, clearSelection,
        aiSettings, askSearch, isTranslating, lastTranslation, clearTranslation, openSettings,
    } = useStore();
    const selectionActive = selectionMode || selectedModels.size > 0;
    const [showHelp, setShowHelp] = useState(false);
    const [askMode, setAskMode] = useState(false);
    const [askText, setAskText] = useState('');
    const aiEnabled = aiSettings?.enabled ?? false;

    const submitAsk = async () => {
        if (!askText.trim() || isTranslating) return;
        await askSearch(askText);
        setAskMode(false);
        setAskText('');
    };

    return (
        <div className="bg-primary-card border-b border-accent-gray px-4 py-3 space-y-3 flex-shrink-0">
            <div className="flex items-center gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                    {askMode ? (
                        <Sparkles size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-blue pointer-events-none" />
                    ) : (
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                    )}
                    {askMode ? (
                        <input
                            type="text"
                            placeholder="Describe what you're looking for, e.g. small printed dragons from last month"
                            value={askText}
                            onChange={(e) => setAskText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void submitAsk();
                                if (e.key === 'Escape') setAskMode(false);
                            }}
                            className="input pl-9 pr-24 h-9 text-sm border-accent-blue"
                            spellCheck={false}
                            autoFocus
                            data-testid="ask-input"
                        />
                    ) : (
                        <input
                            type="text"
                            placeholder="Search files…  (try  tag:printed  type:3mf  tris:>100k)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') setSearchQuery('');
                            }}
                            className="input pl-9 pr-24 h-9 text-sm"
                            spellCheck={false}
                        />
                    )}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {askMode ? (
                            <button onClick={() => void submitAsk()} disabled={isTranslating || !askText.trim()} className="p-1 text-accent-blue hover:text-text-primary disabled:opacity-40" title="Ask (Enter)" data-testid="ask-submit">
                                {isTranslating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            </button>
                        ) : searchQuery ? (
                            <button onClick={() => setSearchQuery('')} className="p-1 text-text-secondary hover:text-text-primary" title="Clear search">
                                <X size={14} />
                            </button>
                        ) : null}
                        <button
                            onClick={() => {
                                if (!aiEnabled) {
                                    openSettings();
                                    return;
                                }
                                setAskMode((v) => !v);
                            }}
                            className={`p-1 ${askMode ? 'text-accent-blue' : 'text-text-secondary hover:text-text-primary'}`}
                            title={aiEnabled ? (askMode ? 'Back to normal search (Esc)' : 'Ask the AI assistant in plain language') : 'Set up the AI assistant in Settings'}
                            aria-pressed={askMode}
                            data-testid="ask-toggle"
                        >
                            <Sparkles size={14} />
                        </button>
                        <button
                            onClick={() => setShowHelp((v) => !v)}
                            className={`p-1 ${showHelp ? 'text-accent-blue' : 'text-text-secondary hover:text-text-primary'}`}
                            title="Search syntax"
                        >
                            <HelpCircle size={14} />
                        </button>
                    </div>

                    {showHelp && (
                        <div className="absolute left-0 right-0 top-full mt-2 z-40 bg-primary-card border border-accent-gray rounded-lg shadow-2xl p-4 text-xs">
                            <div className="font-semibold mb-2 text-text-primary">Search syntax</div>
                            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                                {SYNTAX_HELP.map(([example, description]) => (
                                    <div key={example} className="contents">
                                        <code className="font-mono text-accent-blue">{example}</code>
                                        <span className="text-text-secondary">{description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <span className="text-xs text-text-secondary whitespace-nowrap tabular-nums">
                    {totalModels.toLocaleString()} {totalModels === 1 ? 'model' : 'models'}
                </span>

                {/* Sort */}
                <select
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                        const [newSortBy, newSortOrder] = e.target.value.split('-') as [SortBy, SortOrder];
                        setSortOrder(newSortOrder);
                        setSortBy(newSortBy);
                    }}
                    className="input h-9 text-sm px-3 cursor-pointer w-44"
                >
                    {SORT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>

                {/* Selection mode */}
                <button
                    onClick={() => (selectionActive ? clearSelection() : setSelectionMode(true))}
                    className={`h-9 px-3 rounded-lg border text-sm flex items-center gap-1.5 transition-colors ${selectionActive ? 'bg-accent-blue border-accent-blue text-white' : 'bg-primary-bg border-accent-gray text-text-secondary hover:text-text-primary hover:bg-primary-hover'}`}
                    title={selectionActive ? 'Exit selection (Esc)' : 'Select models (or ⌘/Ctrl-click cards)'}
                >
                    <CheckSquare size={16} />
                    {selectionActive ? 'Done' : 'Select'}
                </button>

                {/* View mode */}
                <div className="flex items-center bg-primary-bg rounded-lg p-1 border border-accent-gray">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded transition-all duration-200 ${viewMode === 'grid' ? 'bg-accent-blue text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-primary-hover'}`}
                        title="Grid view"
                    >
                        <Grid size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded transition-all duration-200 ${viewMode === 'list' ? 'bg-accent-blue text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-primary-hover'}`}
                        title="List view"
                    >
                        <List size={16} />
                    </button>
                </div>
            </div>

            {lastTranslation && (
                <div className="flex items-center gap-2 text-xs text-text-secondary" data-testid="translation-chip">
                    <Sparkles size={12} className="text-accent-blue flex-shrink-0" />
                    <span className="truncate">
                        "{lastTranslation.input}" → <code className="font-mono text-text-primary">{lastTranslation.query}</code>
                        {lastTranslation.explanation && <span className="ml-1 italic">({lastTranslation.explanation})</span>}
                    </span>
                    <button onClick={clearTranslation} className="p-0.5 hover:text-text-primary" title="Dismiss">
                        <X size={12} />
                    </button>
                </div>
            )}

            {tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-wider flex-shrink-0">Filter:</span>
                    {tags.map((tag) => {
                        const isSelected = selectedTags.includes(tag.id);
                        return (
                            <button
                                key={tag.id}
                                onClick={() => toggleTag(tag.id)}
                                className={`tag ${isSelected ? 'active' : ''}`}
                                style={{ backgroundColor: tag.color, color: '#000', opacity: isSelected ? 1 : 0.6 }}
                            >
                                {tag.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
