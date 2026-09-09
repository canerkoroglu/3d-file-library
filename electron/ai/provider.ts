/**
 * Settings and client for an OpenAI-compatible chat endpoint (Ollama, LM Studio, llama.cpp,
 * vLLM, or a remote server). The API key is encrypted with Electron's safeStorage when the
 * platform supports it and never leaves the main process.
 */
import { safeStorage } from 'electron';
import { getSetting, setSetting } from '../settings';
import { AI_DEFAULT_BASE_URL, AI_DEFAULT_MODEL } from '../../src/lib/aiPresets';
import type { AiConnectionResult, AiSettings, AiSettingsUpdate } from '../../src/types';
import type { ChatMessage } from './prompts';

const KEYS = {
    enabled: 'ai.enabled',
    baseUrl: 'ai.baseUrl',
    model: 'ai.model',
    apiKey: 'ai.apiKey',
    autoEnrich: 'ai.autoEnrich',
    timeoutMs: 'ai.timeoutMs',
} as const;

export const AI_DEFAULTS = {
    baseUrl: AI_DEFAULT_BASE_URL,
    model: AI_DEFAULT_MODEL,
    timeoutMs: 90_000,
};

export class AiError extends Error {
    constructor(message: string, readonly kind: 'disabled' | 'unreachable' | 'auth' | 'model' | 'response' | 'timeout' | 'other' = 'other') {
        super(message);
        this.name = 'AiError';
    }
}

interface AiConfig {
    enabled: boolean;
    baseUrl: string;
    model: string;
    apiKey: string | null;
    autoEnrich: boolean;
    timeoutMs: number;
}

/**
 * Ollama exposes an OpenAI-compatible API but only its native API can switch a model's
 * "thinking" off, which small reasoning models otherwise spend the whole token budget on.
 */
type Flavor = 'ollama' | 'openai';
const flavorCache = new Map<string, { flavor: Flavor; at: number }>();
const FLAVOR_TTL_MS = 5 * 60 * 1000;

/** The server origin without the /v1 suffix, e.g. http://localhost:11434 */
export function originOf(baseUrl: string): string {
    return normaliseBaseUrl(baseUrl).replace(/\/v1$/i, '');
}

function encryptKey(key: string): string {
    if (safeStorage.isEncryptionAvailable()) return `enc:${safeStorage.encryptString(key).toString('base64')}`;
    return `plain:${Buffer.from(key, 'utf8').toString('base64')}`;
}

function decryptKey(stored: string | null): string | null {
    if (!stored) return null;
    try {
        if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
        if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8');
    } catch (error) {
        console.warn('[AI] Could not read the stored API key:', error);
    }
    return null;
}

/** Trims and removes a trailing slash; keeps whatever version path the user gave. */
export function normaliseBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
}

export function getAiConfig(): AiConfig {
    return {
        enabled: getSetting<boolean>(KEYS.enabled, false),
        baseUrl: normaliseBaseUrl(getSetting<string>(KEYS.baseUrl, AI_DEFAULTS.baseUrl)) || AI_DEFAULTS.baseUrl,
        model: getSetting<string>(KEYS.model, AI_DEFAULTS.model).trim() || AI_DEFAULTS.model,
        apiKey: decryptKey(getSetting<string | null>(KEYS.apiKey, null)),
        autoEnrich: getSetting<boolean>(KEYS.autoEnrich, false),
        timeoutMs: getSetting<number>(KEYS.timeoutMs, AI_DEFAULTS.timeoutMs),
    };
}

export function getAiSettings(): AiSettings {
    const config = getAiConfig();
    return {
        enabled: config.enabled,
        baseUrl: config.baseUrl,
        model: config.model,
        hasApiKey: Boolean(config.apiKey),
        autoEnrich: config.autoEnrich,
        timeoutMs: config.timeoutMs,
    };
}

export function updateAiSettings(update: AiSettingsUpdate): AiSettings {
    if (update.enabled !== undefined) setSetting(KEYS.enabled, Boolean(update.enabled));
    if (update.baseUrl !== undefined) setSetting(KEYS.baseUrl, normaliseBaseUrl(update.baseUrl) || AI_DEFAULTS.baseUrl);
    if (update.model !== undefined) setSetting(KEYS.model, update.model.trim() || AI_DEFAULTS.model);
    if (update.autoEnrich !== undefined) setSetting(KEYS.autoEnrich, Boolean(update.autoEnrich));
    if (update.timeoutMs !== undefined && Number.isFinite(update.timeoutMs)) setSetting(KEYS.timeoutMs, Math.max(5_000, Math.min(600_000, update.timeoutMs)));
    if (update.apiKey === null) setSetting(KEYS.apiKey, null);
    else if (typeof update.apiKey === 'string' && update.apiKey.trim()) setSetting(KEYS.apiKey, encryptKey(update.apiKey.trim()));
    return getAiSettings();
}

/** Merges unsaved values from the settings form over the stored configuration. */
function resolveConfig(override?: AiSettingsUpdate): AiConfig {
    const config = getAiConfig();
    if (!override) return config;
    return {
        ...config,
        baseUrl: override.baseUrl !== undefined ? normaliseBaseUrl(override.baseUrl) || AI_DEFAULTS.baseUrl : config.baseUrl,
        model: override.model !== undefined ? override.model.trim() || config.model : config.model,
        apiKey: override.apiKey === null ? null : typeof override.apiKey === 'string' && override.apiKey.trim() ? override.apiKey.trim() : config.apiKey,
        timeoutMs: override.timeoutMs ?? config.timeoutMs,
    };
}

function headersFor(config: AiConfig): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    return headers;
}

function describeFetchError(error: unknown, baseUrl: string): AiError {
    if (error instanceof AiError) return error;
    const text = error instanceof Error ? `${error.message} ${String((error as Error & { cause?: unknown }).cause ?? '')}` : String(error);
    if (/abort/i.test(text)) return new AiError('The AI server took too long to answer.', 'timeout');
    if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|fetch failed|network/i.test(text)) {
        return new AiError(`Could not reach the AI server at ${baseUrl}. Is it running?`, 'unreachable');
    }
    return new AiError(text.trim().slice(0, 200) || 'Unknown AI error', 'other');
}

async function request(config: AiConfig, path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(`${config.baseUrl}${path}`, { ...init, headers: { ...headersFor(config), ...(init.headers as Record<string, string> | undefined) }, signal: controller.signal });
    } catch (error) {
        throw describeFetchError(error, config.baseUrl);
    } finally {
        clearTimeout(timer);
    }
}

async function detectFlavor(config: AiConfig): Promise<Flavor> {
    const origin = originOf(config.baseUrl);
    const cached = flavorCache.get(origin);
    if (cached && Date.now() - cached.at < FLAVOR_TTL_MS) return cached.flavor;

    let flavor: Flavor = 'openai';
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5_000);
        try {
            const response = await fetch(`${origin}/api/version`, { headers: headersFor(config), signal: controller.signal });
            if (response.ok) {
                const json = (await response.json()) as { version?: string };
                if (typeof json.version === 'string') flavor = 'ollama';
            }
        } finally {
            clearTimeout(timer);
        }
    } catch {
        // not Ollama, or not reachable; the OpenAI path will report the real error
    }
    flavorCache.set(origin, { flavor, at: Date.now() });
    return flavor;
}

async function errorFromResponse(response: Response, config: AiConfig): Promise<AiError> {
    let detail = '';
    try {
        const body = await response.text();
        try {
            const json = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
            detail = typeof json.error === 'string' ? json.error : json.error?.message ?? json.message ?? body;
        } catch {
            detail = body;
        }
    } catch {
        // no body
    }
    detail = detail.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (response.status === 401 || response.status === 403) return new AiError('The AI server rejected the API key.', 'auth');
    if (response.status === 404 && /model/i.test(detail)) return new AiError(`The server does not have the model "${config.model}"${detail ? ` (${detail})` : ''}.`, 'model');
    if (response.status === 404) return new AiError(`Nothing answered at ${config.baseUrl} (404). Check the base URL, it usually ends in /v1.`, 'unreachable');
    return new AiError(`The AI server answered ${response.status}${detail ? `: ${detail}` : ''}`, 'other');
}

export async function listModels(override?: AiSettingsUpdate): Promise<string[]> {
    const config = resolveConfig(override);
    const response = await request(config, '/models', { method: 'GET' }, Math.min(config.timeoutMs, 15_000));
    if (!response.ok) throw await errorFromResponse(response, config);
    const json = (await response.json()) as { data?: Array<{ id?: string; name?: string }>; models?: Array<{ name?: string; id?: string }> };
    const entries: Array<{ id?: string; name?: string }> = json.data ?? json.models ?? [];
    const ids = entries.map((m) => m.id ?? m.name).filter((id): id is string => Boolean(id));
    return [...new Set(ids)].sort();
}

interface ChatResult {
    text: string;
    /** Reasoning the server returned separately (Ollama, some OpenAI-compatible servers). */
    reasoning?: string;
    truncated: boolean;
}

async function chatOllama(config: AiConfig, messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
    const body = {
        model: config.model,
        messages,
        stream: false,
        think: false,
        ...(options.json ? { format: 'json' } : {}),
        options: { temperature: options.temperature ?? 0.2, num_predict: options.maxTokens ?? 700 },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? config.timeoutMs);
    let response: Response;
    try {
        response = await fetch(`${originOf(config.baseUrl)}/api/chat`, { method: 'POST', headers: headersFor(config), body: JSON.stringify(body), signal: controller.signal });
    } catch (error) {
        throw describeFetchError(error, config.baseUrl);
    } finally {
        clearTimeout(timer);
    }
    if (!response.ok) throw await errorFromResponse(response, config);
    const json = (await response.json()) as { message?: { content?: string; thinking?: string }; done_reason?: string };
    return { text: json.message?.content ?? '', reasoning: json.message?.thinking, truncated: json.done_reason === 'length' };
}

async function chatOpenAi(config: AiConfig, messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
    const body: Record<string, unknown> = {
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 700,
        stream: false,
        // Honoured by vLLM / SGLang for Qwen-style models; ignored elsewhere.
        chat_template_kwargs: { enable_thinking: false },
    };
    if (options.json) body.response_format = { type: 'json_object' };

    let response = await request(config, '/chat/completions', { method: 'POST', body: JSON.stringify(body) }, options.timeoutMs ?? config.timeoutMs);
    if (!response.ok && response.status === 400) {
        // Strict servers reject unknown fields; retry with the plain request and rely on the prompt.
        delete body.response_format;
        delete body.chat_template_kwargs;
        response = await request(config, '/chat/completions', { method: 'POST', body: JSON.stringify(body) }, options.timeoutMs ?? config.timeoutMs);
    }
    if (!response.ok) throw await errorFromResponse(response, config);

    const json = (await response.json()) as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string | Array<{ type?: string; text?: string }>; reasoning?: string; reasoning_content?: string } }>;
    };
    const choice = json.choices?.[0];
    const content = choice?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => part.text ?? '').join('') : '';
    return { text, reasoning: choice?.message?.reasoning ?? choice?.message?.reasoning_content, truncated: choice?.finish_reason === 'length' };
}

export async function testConnection(override?: AiSettingsUpdate): Promise<AiConnectionResult> {
    const config = resolveConfig(override);
    const started = Date.now();
    try {
        const models = await listModels(override);
        return {
            ok: true,
            baseUrl: config.baseUrl,
            latencyMs: Date.now() - started,
            models,
            modelAvailable: models.length > 0 ? models.includes(config.model) : undefined,
        };
    } catch (error) {
        const described = error instanceof AiError ? error : describeFetchError(error, config.baseUrl);
        return { ok: false, baseUrl: config.baseUrl, models: [], error: described.message };
    }
}

/** Removes Qwen-style <think> blocks that some servers include in the content. */
export function stripThinking(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').trim();
}

/** Finds the first JSON object in free text (models sometimes wrap it in prose or code fences). */
export function extractJson(text: string): unknown | null {
    const cleaned = stripThinking(text).replace(/```(?:json)?/gi, '').trim();
    const start = cleaned.indexOf('{');
    if (start < 0) return null;
    // Walk to the matching closing brace so trailing prose does not break parsing.
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(cleaned.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

interface ChatOptions {
    maxTokens?: number;
    temperature?: number;
    /** Ask the server for a JSON object; falls back to plain text when unsupported. */
    json?: boolean;
    timeoutMs?: number;
}

/** Sends a chat completion and returns the assistant text (thinking blocks removed). */
export async function chat(messages: ChatMessage[], options: ChatOptions = {}, override?: AiSettingsUpdate): Promise<string> {
    const config = resolveConfig(override);
    if (!config.enabled && !override) throw new AiError('The AI assistant is turned off in Settings.', 'disabled');

    const flavor = await detectFlavor(config);
    const result = flavor === 'ollama' ? await chatOllama(config, messages, options) : await chatOpenAi(config, messages, options);
    const text = stripThinking(result.text);
    if (!text) {
        if (result.truncated || result.reasoning) {
            throw new AiError('The model used its whole answer budget on reasoning and produced no text. Use a non-reasoning model, or a server that can switch thinking off (Ollama does).', 'response');
        }
        throw new AiError('The AI server returned an empty answer.', 'response');
    }
    return text;
}

/** Chat completion that must yield a JSON object. */
export async function chatJson(messages: ChatMessage[], options: ChatOptions = {}, override?: AiSettingsUpdate): Promise<unknown> {
    const text = await chat(messages, { ...options, json: true }, override);
    const parsed = extractJson(text);
    if (parsed === null) throw new AiError(`The assistant did not answer with JSON: ${text.slice(0, 120)}`, 'response');
    return parsed;
}
