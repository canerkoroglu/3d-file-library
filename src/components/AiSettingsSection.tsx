import { useEffect, useState } from 'react';
import { Sparkles, Plug, Loader2, CheckCircle2, XCircle, Play, Square, KeyRound } from 'lucide-react';
import { useStore } from '../store/store';
import { AI_PRESETS } from '../lib/aiPresets';
import type { AiConnectionResult } from '../types';

/** The "AI assistant" block of the settings dialog: server, model, connection test and library analysis. */
export default function AiSettingsSection() {
    const { aiSettings, updateAiSettings, aiProgress, enrichModels, cancelEnrichment, libraryStats, reportError } = useStore();

    const [baseUrl, setBaseUrl] = useState('');
    const [model, setModel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [clearKey, setClearKey] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<AiConnectionResult | null>(null);
    const [saving, setSaving] = useState(false);
    const [timeoutSec, setTimeoutSec] = useState(90);

    useEffect(() => {
        if (!aiSettings || dirty) return;
        setBaseUrl(aiSettings.baseUrl);
        setModel(aiSettings.model);
        setTimeoutSec(Math.round(aiSettings.timeoutMs / 1000));
    }, [aiSettings, dirty]);

    if (!aiSettings) return null;

    const preset = AI_PRESETS.find((p) => p.baseUrl === baseUrl.trim().replace(/\/+$/, ''))?.id ?? 'custom';
    const pendingUpdate = () => ({
        baseUrl,
        model,
        timeoutMs: Math.round(timeoutSec * 1000),
        ...(clearKey ? { apiKey: null } : apiKey.trim() ? { apiKey } : {}),
    });

    const test = async () => {
        setTesting(true);
        setResult(null);
        try {
            const outcome = await window.electronAPI.testAiConnection(pendingUpdate());
            setResult(outcome);
            // Pick a sensible model when the configured one is not on the server.
            if (outcome.ok && outcome.modelAvailable === false && outcome.models.length > 0) {
                const chatModels = outcome.models.filter((m) => !/embed/i.test(m));
                const pool = chatModels.length > 0 ? chatModels : outcome.models;
                const preferred = pool.find((m) => /qwen/i.test(m)) ?? pool[0];
                setModel(preferred);
                setDirty(true);
            }
        } catch (error) {
            reportError('Connection test failed', error);
        } finally {
            setTesting(false);
        }
    };

    const save = async (extra: Partial<{ enabled: boolean; autoEnrich: boolean }> = {}) => {
        setSaving(true);
        try {
            await updateAiSettings({ ...pendingUpdate(), ...extra });
            setApiKey('');
            setClearKey(false);
            setDirty(false);
        } finally {
            setSaving(false);
        }
    };

    const analysed = libraryStats ? Math.max(0, libraryStats.models - (libraryStats.missing ?? 0)) : 0;

    return (
        <section className="space-y-4" data-testid="ai-settings">
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Sparkles size={14} /> AI assistant
            </h3>
            <div className="bg-primary-bg rounded-lg border border-accent-gray p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="font-medium text-text-primary">Use a language model</div>
                        <div className="text-sm text-text-secondary">
                            Works with any OpenAI-compatible server: Ollama or LM Studio on this computer, or a remote host. Nothing is sent anywhere else.
                            The assistant describes and categorises models for search, suggests tags, and turns plain-language questions into searches.
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-text-primary select-none cursor-pointer flex-shrink-0">
                        <input
                            type="checkbox"
                            checked={aiSettings.enabled}
                            onChange={(e) => void updateAiSettings({ enabled: e.target.checked })}
                            className="accent-blue-500"
                            data-testid="ai-enabled"
                        />
                        Enabled
                    </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Server</label>
                        <select
                            value={preset}
                            onChange={(e) => {
                                const chosen = AI_PRESETS.find((p) => p.id === e.target.value);
                                if (chosen) setBaseUrl(chosen.baseUrl);
                                setDirty(true);
                            }}
                            className="input w-full"
                        >
                            {AI_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            <option value="custom">Custom / remote server…</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Base URL</label>
                        <input
                            type="text"
                            value={baseUrl}
                            onChange={(e) => {
                                setBaseUrl(e.target.value);
                                setDirty(true);
                            }}
                            placeholder="https://llm.example.com/v1"
                            className="input w-full font-mono text-sm"
                            spellCheck={false}
                            data-testid="ai-base-url"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Model</label>
                        <input
                            type="text"
                            list="ai-model-options"
                            value={model}
                            onChange={(e) => {
                                setModel(e.target.value);
                                setDirty(true);
                            }}
                            placeholder="qwen3:8b"
                            className="input w-full font-mono text-sm"
                            spellCheck={false}
                            data-testid="ai-model"
                        />
                        <datalist id="ai-model-options">
                            {(result?.models ?? []).map((m) => <option key={m} value={m} />)}
                        </datalist>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                            API key <span className="normal-case font-normal">(optional{aiSettings.hasApiKey ? ', one is saved' : ''})</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    setClearKey(false);
                                    setDirty(true);
                                }}
                                placeholder={aiSettings.hasApiKey && !clearKey ? '••••••••' : 'none'}
                                className="input w-full font-mono text-sm"
                                autoComplete="off"
                            />
                            {aiSettings.hasApiKey && !clearKey && (
                                <button
                                    onClick={() => {
                                        setClearKey(true);
                                        setApiKey('');
                                        setDirty(true);
                                    }}
                                    className="btn btn-secondary text-sm px-3"
                                    title="Remove the saved key"
                                >
                                    <KeyRound size={14} /> Clear
                                </button>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Response timeout (seconds)</label>
                        <input
                            type="number"
                            min={5}
                            max={600}
                            value={timeoutSec}
                            onChange={(e) => {
                                setTimeoutSec(Math.max(5, Math.min(600, Math.round(Number(e.target.value) || 0))));
                                setDirty(true);
                            }}
                            className="input w-full font-mono text-sm"
                            data-testid="ai-timeout"
                        />
                        <p className="text-xs text-text-secondary mt-1">Raise this for large remote models; a 27B model can take over a minute per file.</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={test} disabled={testing || !baseUrl.trim()} className="btn btn-secondary text-sm disabled:opacity-50" data-testid="ai-test">
                        {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />} Test connection
                    </button>
                    <button onClick={() => void save()} disabled={saving || !dirty} className="btn btn-primary text-sm disabled:opacity-50" data-testid="ai-save">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save
                    </button>
                    {result && (
                        <span className={`text-sm flex items-center gap-1.5 ${result.ok ? 'text-green-500' : 'text-red-400'}`} data-testid="ai-test-result">
                            {result.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                            {result.ok
                                ? `Connected in ${result.latencyMs} ms` +
                                  (result.models.length > 0
                                      ? result.modelAvailable
                                          ? `, ${result.models.length} model${result.models.length === 1 ? '' : 's'} available`
                                          : `; "${aiSettings.model}" is not on this server, picked "${model}"`
                                      : '')
                                : result.error}
                        </span>
                    )}
                </div>

                <div className="border-t border-accent-gray pt-4 space-y-3">
                    <label className={`flex items-center gap-2 text-sm text-text-primary select-none ${aiSettings.enabled ? 'cursor-pointer' : 'opacity-50'}`}>
                        <input
                            type="checkbox"
                            checked={aiSettings.autoEnrich}
                            disabled={!aiSettings.enabled}
                            onChange={(e) => void updateAiSettings({ autoEnrich: e.target.checked })}
                            className="accent-blue-500"
                        />
                        Analyse new models automatically as they are imported
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        {aiProgress?.isRunning ? (
                            <button onClick={() => void cancelEnrichment()} className="btn btn-secondary text-sm">
                                <Square size={14} /> Stop ({aiProgress.completed + aiProgress.failed} / {aiProgress.total})
                            </button>
                        ) : (
                            <>
                                <button onClick={() => void enrichModels({ scope: 'missing' })} disabled={!aiSettings.enabled} className="btn btn-secondary text-sm disabled:opacity-50" data-testid="ai-analyse-missing">
                                    <Play size={14} /> Analyse models without a description
                                </button>
                                <button onClick={() => void enrichModels({ scope: 'all' })} disabled={!aiSettings.enabled} className="btn btn-secondary text-sm disabled:opacity-50">
                                    <Play size={14} /> Re-analyse everything
                                </button>
                            </>
                        )}
                        <span className="text-xs text-text-secondary">
                            {analysed.toLocaleString()} models in the library. A local 8B model takes a few seconds per file; you can keep working meanwhile.
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}
