import { Sparkles } from 'lucide-react';
import { useStore } from '../../store/store';
import type { ModelWithTags } from '../../types';
import { Field } from './Field';

/** AI description, category, keywords and suggested tags, with actions to (re)analyse and apply tags. */
export default function AiSection({ model, missing }: { model: ModelWithTags; missing: boolean }) {
    const { tags, aiSettings, aiProgress, enrichModels, applySuggestedTags, setSearchQuery, closeViewer, openSettings } = useStore();
    const ai = model.aiMetadata;

    const searchFor = (query: string) => {
        setSearchQuery(query);
        closeViewer();
    };

    const applied = new Set(model.tags.map((t) => t.name.toLowerCase()));
    const pending = ai ? ai.suggestedTags.filter((t) => !applied.has(t.toLowerCase())) : [];

    return (
        <section data-testid="ai-section">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><Sparkles size={14} className="text-accent-blue" /> AI</h3>
                {aiSettings?.enabled ? (
                    <button
                        onClick={() => void enrichModels({ ids: [model.id] })}
                        disabled={Boolean(aiProgress?.isRunning) || missing}
                        className="text-xs text-accent-blue hover:underline disabled:opacity-50 disabled:no-underline"
                        data-testid="ai-analyse"
                    >
                        {ai ? 'Analyse again' : 'Analyse'}
                    </button>
                ) : (
                    <button onClick={openSettings} className="text-xs text-accent-blue hover:underline">Set up</button>
                )}
            </div>
            {ai ? (
                <div className="space-y-3">
                    <Field label="Name">{ai.name}</Field>
                    <Field label="Summary"><span className="text-xs">{ai.summary}</span></Field>
                    <div>
                        <div className="text-text-secondary text-xs mb-1">Category</div>
                        <button
                            onClick={() => searchFor(`category:"${ai.category}"`)}
                            className="tag bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25"
                            title="Show everything in this category"
                        >
                            {ai.category}
                        </button>
                    </div>
                    {ai.keywords.length > 0 && (
                        <div>
                            <div className="text-text-secondary text-xs mb-1">Keywords</div>
                            <div className="flex flex-wrap gap-1.5">
                                {ai.keywords.map((k) => (
                                    <button
                                        key={k}
                                        onClick={() => searchFor(k)}
                                        className="px-2 py-0.5 rounded-md bg-primary-bg text-xs text-text-secondary hover:text-text-primary border border-accent-gray"
                                        title={`Search for "${k}"`}
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {ai.suggestedTags.length > 0 && (
                        <div>
                            <div className="text-text-secondary text-xs mb-1">Suggested tags</div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {ai.suggestedTags.map((name) => {
                                    const tag = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
                                    const isApplied = applied.has(name.toLowerCase());
                                    return (
                                        <span key={name} className="tag" style={{ backgroundColor: tag?.color ?? '#888', color: '#000', opacity: isApplied ? 1 : 0.6 }}>
                                            {name}{isApplied ? ' ✓' : ''}
                                        </span>
                                    );
                                })}
                                {pending.length > 0 && (
                                    <button onClick={() => void applySuggestedTags(model.id)} className="text-xs text-accent-blue hover:underline" data-testid="ai-apply-tags">
                                        Apply {pending.length === ai.suggestedTags.length ? 'all' : `${pending.length} more`}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="text-[10px] text-text-secondary">{ai.model} · {new Date(ai.generatedAt).toLocaleString()}</div>
                </div>
            ) : (
                <div className="text-text-secondary text-xs italic">
                    {aiSettings?.enabled ? 'Not analysed yet.' : 'Connect a local model in Settings to get descriptions, categories and tag suggestions.'}
                </div>
            )}
        </section>
    );
}
