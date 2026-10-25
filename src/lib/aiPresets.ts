export interface AiPreset {
    id: string;
    name: string;
    baseUrl: string;
    /** Model to select when the preset is chosen; otherwise the current model name is kept. */
    model?: string;
}

/**
 * Common local servers; anything else goes in as a custom base URL (for example a remote host
 * behind HTTPS). Only generic, well-known defaults belong here: this list ships to every user.
 */
export const AI_PRESETS: readonly AiPreset[] = [
    { id: 'ollama', name: 'Ollama on this computer', baseUrl: 'http://localhost:11434/v1' },
    { id: 'lmstudio', name: 'LM Studio on this computer', baseUrl: 'http://localhost:1234/v1' },
    { id: 'llamacpp', name: 'llama.cpp server on this computer', baseUrl: 'http://localhost:8080/v1' },
];

export const AI_DEFAULT_BASE_URL = AI_PRESETS[0].baseUrl;
export const AI_DEFAULT_MODEL = 'qwen3:8b';
