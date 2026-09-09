// A tiny OpenAI-compatible server with canned answers, so the AI features can be tested
// end to end without a real model. It recognises the two prompts the app sends.
import http from 'node:http';

function enrichmentFor(userPrompt) {
    const filename = (userPrompt.match(/Filename: (.+)/) || [])[1]?.trim() ?? 'unknown.stl';
    const stem = filename.replace(/\.[^.]+$/, '');
    const lower = stem.toLowerCase();
    const category = lower.includes('dragon') ? 'figurine' : lower.includes('bracket') ? 'bracket or mount' : lower.includes('vase') ? 'vase or planter' : 'other';
    return {
        name: stem.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        summary: `Fake description of ${stem} produced by the test server.`,
        category,
        keywords: ['fake', ...lower.split(/[_-]+/).filter((w) => w.length > 2)],
        suggestedTags: lower.includes('dragon') ? ['Printed', 'NotARealTag'] : [],
    };
}

function translationFor(userPrompt) {
    const request = ((userPrompt.match(/Request: (.+)/) || [])[1] ?? '').toLowerCase();
    const parts = [];
    for (const word of request.split(/\s+/)) {
        if (['printed', 'i', 'my', 'the', 'small', 'large', 'from', 'last', 'month', 'week', 'models', 'files'].includes(word)) continue;
        if (word) parts.push(word.replace(/s$/, ''));
    }
    if (request.includes('printed')) parts.push('tag:Printed');
    if (request.includes('small')) parts.push('size:<50');
    if (request.includes('large')) parts.push('size:>150');
    if (request.includes('last month')) parts.push('added:>1m');
    return { query: parts.join(' '), explanation: 'canned translation' };
}

/** Starts the server on a free port; resolves with { baseUrl, requests, close }. */
export function startFakeLlm() {
    const requests = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            requests.push({ method: req.method, url: req.url, body });
            const json = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };
            if (req.method === 'GET' && req.url === '/v1/models') {
                return json(200, { object: 'list', data: [{ id: 'fake-qwen' }, { id: 'other-model' }] });
            }
            if (req.method === 'POST' && req.url === '/v1/chat/completions') {
                const payload = JSON.parse(body || '{}');
                if (payload.model !== 'fake-qwen') return json(404, { error: { message: `model "${payload.model}" not found` } });
                const system = payload.messages.find((m) => m.role === 'system')?.content ?? '';
                const user = payload.messages.find((m) => m.role === 'user')?.content ?? '';
                const answer = /translate a person/i.test(system) ? translationFor(user) : enrichmentFor(user);
                // Wrap in prose and a thinking block to prove the client tolerates both.
                const content = `<think>fake reasoning</think>Here you go:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``;
                return json(200, { id: 'fake', object: 'chat.completion', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] });
            }
            json(404, { error: { message: 'not found' } });
        });
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                baseUrl: `http://127.0.0.1:${port}/v1`,
                requests,
                close: () => new Promise((done) => server.close(() => done())),
            });
        });
    });
}
