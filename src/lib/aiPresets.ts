/** Common local servers; anything else goes in as a custom base URL (for example a remote host behind HTTPS). */
export const AI_PRESETS = [
    { id: 'ollama', name: 'Ollama on this computer', baseUrl: 'http://localhost:11434/v1' },
    { id: 'lmstudio', name: 'LM Studio on this computer', baseUrl: 'http://localhost:1234/v1' },
    { id: 'llamacpp', name: 'llama.cpp server on this computer', baseUrl: 'http://localhost:8080/v1' },
    { id: 'caner', name: 'openai.caner.in (remote)', baseUrl: 'https://openai.caner.in/v1' },
] as const;

export const AI_DEFAULT_BASE_URL = AI_PRESETS[0].baseUrl;
export const AI_DEFAULT_MODEL = 'qwen3:8b';
