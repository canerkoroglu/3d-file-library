// End-to-end scenarios. Each receives { app, library, profileDir, fixtures, tmpDir } and asserts with node:assert.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './driver.mjs';

const modelCounter = `parseInt((document.body.innerText.match(/(\\d[\\d,]*) models?\\b/) || ['0', '0'])[1].replace(/,/g, ''))`;
const setSearch = (text) => `(() => {
    const input = document.querySelector('input[placeholder^="Search"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
})()`;
const clickButton = (text) => `(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (!button) throw new Error('No button with text ' + ${JSON.stringify(text)});
    button.click();
    return true;
})()`;
const clickCard = (index, init = {}) => `(() => {
    const cards = document.querySelectorAll('.model-card');
    cards[${index}].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...${JSON.stringify(init)} }));
    return cards.length;
})()`;

/** Waits until analysis and preview rendering are both finished. */
async function waitForIndexer(app) {
    await app.waitFor(`window.electronAPI.getIndexProgress().then((p) => !p.isRunning)`, { timeout: 180_000, label: 'indexing and preview rendering to finish' });
}

export const scenarios = [
    {
        name: 'imports and indexes the watched folder',
        async run({ app, library }) {
            await app.waitFor(`${modelCounter} >= ${library.totalModels}`, { timeout: 90_000, label: 'all models to be imported' });
            await waitForIndexer(app);
            const stats = await app.evaluate(`window.electronAPI.getLibraryStats()`);
            assert.equal(stats.models, library.totalModels);
            assert.equal(stats.missing, 0);

            const [dragon] = (await app.evaluate(`window.electronAPI.getModels({ searchQuery: 'dragon_body', limit: 1 })`)).items;
            assert.equal(dragon.triangleCount, 6);
            assert.deepEqual(dragon.bbox, { x: 40, y: 40, z: 60 });
            assert.equal(dragon.volumeMm3, 32000);
            assert.equal(dragon.sourceMetadata?.source, 'Thingiverse', 'README link becomes the source');
            assert.equal(dragon.sourceMetadata?.license, 'CC BY-NC-SA 4.0');
            assert.equal(dragon.thumbnailSource, 'sidecar', 'matching photo is used as the thumbnail');
            assert.ok(dragon.hasReadme);

            const [cone] = (await app.evaluate(`window.electronAPI.getModels({ searchQuery: 'cone', limit: 1 })`)).items;
            assert.equal(cone.printMeta?.printerModel, 'Bambu Lab P1S');
            assert.equal(cone.printMeta?.designer, 'Cone Person');
            assert.equal(cone.thumbnailSource, 'embedded');

            const [wing] = (await app.evaluate(`window.electronAPI.getModels({ searchQuery: 'dragon_wing', limit: 1 })`)).items;
            assert.equal(wing.thumbnailSource, 'render', 'a generic folder image is replaced by a 3D render');
            assert.ok(fs.existsSync(wing.thumbnailPath), 'the rendered thumbnail exists on disk');
        },
    },
    {
        name: 'search operators and relevance ranking',
        async run({ app, library }) {
            const total = async (query) => (await app.evaluate(`window.electronAPI.getModels({ searchQuery: ${JSON.stringify(query)}, limit: 1 })`)).total;
            assert.equal(await total('benchy'), library.benchyCount);
            assert.equal(await total('articulated'), 2, 'README text is searchable');
            assert.equal(await total('PETG'), 1, 'slicer filament is searchable');
            assert.equal(await total('type:3mf'), 1);
            assert.equal(await total('tag:printed'), 0);
            assert.equal(await total('has:readme'), 2);
            assert.equal(await total('size:>50'), await total('size:>50 is:available'));
            assert.ok((await total('tris:>10')) >= 1);

            await app.evaluate(setSearch('dragon'));
            await app.waitFor(`${modelCounter} === 3`, { label: 'the grid to filter on "dragon"' });
            assert.equal(await app.evaluate(`document.querySelector('select').value`), 'relevance-desc', 'free text switches to relevance');
            await app.evaluate(setSearch(''));
            await app.waitFor(`${modelCounter} === ${library.totalModels}`, { label: 'the grid to show everything again' });
        },
    },
    {
        name: 'pages the grid while scrolling',
        async run({ app, library }) {
            const footer = () => app.evaluate(`(document.body.innerText.match(/(\\d[\\d,]*) of (\\d[\\d,]*) loaded/) || []).slice(1, 3).map(Number)`);
            assert.deepEqual(await footer(), [200, library.totalModels]);
            for (let i = 0; i < 10 && (await footer()).length > 0; i++) {
                await app.evaluate(`(() => { const el = document.querySelector('.overflow-y-auto.bg-primary-bg'); el.scrollTop = el.scrollHeight; return true; })()`);
                await sleep(500);
            }
            assert.deepEqual(await footer(), [], 'everything is loaded after scrolling');
            await app.evaluate(`(() => { document.querySelector('.overflow-y-auto.bg-primary-bg').scrollTop = 0; return true; })()`);
        },
    },
    {
        name: 'selects models and applies bulk tags',
        async run({ app }) {
            const selectedCount = () => app.evaluate(`Number((document.body.innerText.match(/(\\d+)\\s*selected/) || [0, 0])[1])`);
            await app.evaluate(clickCard(0, { metaKey: true }));
            await sleep(150);
            assert.equal(await selectedCount(), 1);
            assert.equal(await app.evaluate(`!!document.querySelector('button[title="Close (Esc)"]')`), false, 'modifier click does not open the viewer');
            await app.evaluate(clickCard(4, { shiftKey: true }));
            await sleep(150);
            assert.equal(await selectedCount(), 5);

            await app.evaluate(clickButton('Add tag'));
            await sleep(150);
            await app.evaluate(`(() => { [...document.querySelectorAll('.animate-slide-up button')].find((b) => b.textContent.trim() === 'Printed').click(); return true; })()`);
            await app.waitFor(`window.electronAPI.getModels({ searchQuery: 'tag:printed', limit: 1 }).then((p) => p.total === 5)`, { label: 'five models to carry the tag' });

            await app.evaluate(clickButton('Remove tag'));
            await sleep(150);
            await app.evaluate(`(() => { [...document.querySelectorAll('.animate-slide-up button')].find((b) => b.textContent.trim() === 'Printed').click(); return true; })()`);
            await app.waitFor(`window.electronAPI.getModels({ searchQuery: 'tag:printed', limit: 1 }).then((p) => p.total === 0)`, { label: 'the tag to be removed again' });

            await app.evaluate(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
            await sleep(150);
            assert.equal(await selectedCount(), 0, 'Escape clears the selection');
        },
    },
    {
        name: 'viewer tools toggle and keyboard shortcuts work',
        async run({ app }) {
            await app.evaluate(`(() => { [...document.querySelectorAll('.model-card')].find((c) => !c.textContent.includes('Missing')).click(); return true; })()`);
            await app.waitFor(`!!document.querySelector('[data-testid="viewer-tools"]')`, { label: 'the viewer toolbar' });
            const stateExpr = (label) => `document.querySelector('[data-testid="viewer-tools"] button[aria-label^="${label}"]').getAttribute('aria-pressed')`;
            const expectState = (label, value, why) => app.waitFor(`${stateExpr(label)} === ${JSON.stringify(value)}`, { timeout: 5_000, label: why ?? `${label} to be ${value}` });
            const press = (label) => app.evaluate(`(() => { document.querySelector('[data-testid="viewer-tools"] button[aria-label^="${label}"]').click(); return true; })()`);
            await expectState('Wireframe', 'false', 'wireframe to start off');
            await expectState('Grid', 'true', 'the grid to start on');
            await press('Wireframe');
            await expectState('Wireframe', 'true', 'the wireframe button to switch on');
            await app.evaluate(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true })); return true; })()`);
            await expectState('Wireframe', 'false', 'the W key to switch wireframe off');
            await press('Grid');
            await expectState('Grid', 'false', 'the grid button to switch off');
            await press('Section view');
            await app.waitFor(`!!document.querySelector('input[aria-label="Section height"]')`, { label: 'the section slider' });
            assert.ok(await app.evaluate(`!!document.querySelector('button[aria-label="Choose a slicer"]')`), 'slicer split button is present');
            await app.evaluate(`(() => { document.querySelector('button[title="Close (Esc)"]').click(); return true; })()`);
            await app.waitFor(`!document.querySelector('[data-testid="viewer-tools"]')`, { label: 'the viewer to close' });
        },
    },
    {
        name: 'imports a zip archive into the watched folder',
        async run({ app, library, tmpDir, fixtures }) {
            const zipPath = path.join(tmpDir, 'Articulated_Dragon_v2-3210987.zip');
            const expected = await fixtures.createThingiverseZip(zipPath);
            const collectionId = await app.evaluate(`window.electronAPI.getCollections().then((c) => c.find((x) => x.type === 'watched').id)`);
            const [result] = await app.evaluate(`window.electronAPI.importZip({ zipPaths: [${JSON.stringify(zipPath)}], collectionId: ${collectionId} })`);
            assert.equal(result.error, undefined);
            assert.equal(result.models, expected.models);
            assert.equal(result.extracted, expected.extracted);
            assert.ok(fs.existsSync(path.join(result.folder, 'files', 'dragon_head.stl')), 'wrapper directory is stripped');
            await app.waitFor(`${modelCounter} === ${library.totalModels + expected.models}`, { label: 'the grid to show the imported models' });
            await waitForIndexer(app);
            const [head] = (await app.evaluate(`window.electronAPI.getModels({ searchQuery: 'dragon_head', limit: 1 })`)).items;
            assert.equal(head.sourceMetadata?.url, 'https://www.thingiverse.com/thing:3210987');
            assert.equal(head.sourceMetadata?.license, 'CC BY-NC 4.0');
            assert.equal(head.thumbnailSource, 'sidecar');
            library.totalModels += expected.models;
        },
    },
    {
        name: 'flags missing files and restores them',
        async run({ app, tmpDir }) {
            const file = path.join(tmpDir, 'library', 'misc', 'bracket_v2.obj');
            const aside = path.join(tmpDir, 'bracket_v2.obj');
            const missingTotal = () => app.evaluate(`window.electronAPI.getModels({ searchQuery: 'is:missing', limit: 1 }).then((p) => p.total)`);
            fs.renameSync(file, aside);
            try {
                await app.waitFor(`window.electronAPI.getModels({ searchQuery: 'is:missing', limit: 1 }).then((p) => p.total === 1)`, { timeout: 20_000, label: 'the file to be flagged missing' });
            } finally {
                fs.renameSync(aside, file);
            }
            await app.waitFor(`window.electronAPI.getModels({ searchQuery: 'is:missing', limit: 1 }).then((p) => p.total === 0)`, { timeout: 20_000, label: 'the file to be restored' });
            assert.equal(await missingTotal(), 0);
            const stats = await app.evaluate(`window.electronAPI.getLibraryStats()`);
            assert.equal(stats.missing, 0);
        },
    },
    {
        name: 'reports errors as toasts',
        async run({ app }) {
            await app.evaluate(`(() => { [...document.querySelectorAll('.model-card')].find((c) => !c.textContent.includes('Missing')).click(); return true; })()`);
            await app.waitFor(`!!document.querySelector('button[title="Close (Esc)"]')`, { label: 'the viewer' });
            await app.evaluate(clickButton('+ New Tag'));
            await sleep(150);
            await app.evaluate(`(() => { const input = document.querySelector('input[placeholder="Tag name…"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'Printed'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
            for (let attempt = 0; attempt < 4; attempt++) {
                await sleep(400);
                await app.evaluate(`(() => { document.querySelector('input[placeholder="Tag name…"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
                await sleep(500);
                if (await app.evaluate(`document.querySelectorAll('[data-testid="toast-host"] [role]').length > 0`)) break;
            }
            const toasts = await app.waitFor(`[...document.querySelectorAll('[data-testid="toast-host"] [role]')].map((t) => t.dataset.kind + ': ' + t.textContent)`, { timeout: 5_000, label: 'an error toast' });
            assert.ok(toasts.some((t) => t.startsWith('error:') && t.includes('already exists')), `expected a duplicate-name error, got ${JSON.stringify(toasts)}`);
            await app.evaluate(`(() => { document.querySelector('button[title="Close (Esc)"]').click(); return true; })()`);
        },
    },
    {
        name: 'AI assistant: setup, plain-language search and enrichment',
        async run({ app, fakeLlm }) {
            const setInput = (selector, value) => app.evaluate(`(() => {
                const input = document.querySelector(${JSON.stringify(selector)});
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                setter.call(input, ${JSON.stringify(value)});
                input.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            })()`);

            // Configure the assistant against the fake server through the settings dialog.
            await app.evaluate(`(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Settings')).click(); return true; })()`);
            await app.waitFor(`!!document.querySelector('[data-testid="ai-settings"]')`, { label: 'the AI settings' });
            await setInput('[data-testid="ai-base-url"]', fakeLlm.baseUrl);
            await setInput('[data-testid="ai-model"]', 'wrong-model');
            await app.evaluate(`(() => { document.querySelector('[data-testid="ai-test"]').click(); return true; })()`);
            const testResult = await app.waitFor(`document.querySelector('[data-testid="ai-test-result"]')?.textContent ?? ''`, { timeout: 10_000, label: 'the connection test result' });
            assert.match(testResult, /Connected in \d+ ms/);
            assert.match(testResult, /picked "fake-qwen"/, 'an unavailable model is swapped for one the server has');
            await app.evaluate(`(() => { document.querySelector('[data-testid="ai-save"]').click(); return true; })()`);
            await app.waitFor(`document.querySelector('[data-testid="ai-save"]').disabled`, { label: 'the settings to be saved' });
            await app.evaluate(`(() => { const box = document.querySelector('[data-testid="ai-enabled"]'); if (!box.checked) box.click(); return true; })()`);
            await app.waitFor(`window.electronAPI.getAiSettings().then((s) => s.enabled && s.model === 'fake-qwen')`, { label: 'the assistant to be enabled' });
            await app.evaluate(clickButton('Close'));

            // Plain-language search goes through the translator and lands in the search box.
            await app.evaluate(`(() => { document.querySelector('[data-testid="ask-toggle"]').click(); return true; })()`);
            await app.waitFor(`!!document.querySelector('[data-testid="ask-input"]')`, { label: 'the ask box' });
            await setInput('[data-testid="ask-input"]', 'small printed dragons');
            await sleep(200);
            await app.evaluate(`(() => { document.querySelector('[data-testid="ask-submit"]').click(); return true; })()`);
            const chip = await app.waitFor(`document.querySelector('[data-testid="translation-chip"]')?.textContent ?? ''`, { timeout: 15_000, label: 'the translation chip' });
            assert.match(chip, /dragon tag:Printed size:<50/);
            assert.equal(await app.evaluate(`document.querySelector('input[placeholder^="Search"]').value`), 'dragon tag:Printed size:<50');
            await app.evaluate(setSearch(''));
            await app.waitFor(`${modelCounter} > 100`, { label: 'the full library again' });

            // Enrich one model from the viewer and apply the suggested tag.
            const [dragon] = (await app.evaluate(`window.electronAPI.getModels({ searchQuery: 'dragon_body', limit: 1 })`)).items;
            await app.evaluate(`window.electronAPI.enrichModels({ ids: [${dragon.id}] })`);
            await app.waitFor(`window.electronAPI.getModels({ searchQuery: 'dragon_body', limit: 1 }).then((p) => !!p.items[0]?.aiMetadata)`, { timeout: 30_000, label: 'the model to be enriched' });
            const [enriched] = (await app.evaluate(`window.electronAPI.getModels({ searchQuery: 'dragon_body', limit: 1 })`)).items;
            assert.equal(enriched.aiMetadata.category, 'figurine');
            assert.deepEqual(enriched.aiMetadata.suggestedTags, ['Printed'], 'unknown tag names are dropped');
            assert.ok(enriched.aiMetadata.keywords.includes('dragon'));
            assert.equal(enriched.aiMetadata.model, 'fake-qwen');
            assert.equal((await app.evaluate(`window.electronAPI.getModels({ searchQuery: 'category:figurine', limit: 1 })`)).total, 1);
            assert.ok((await app.evaluate(`window.electronAPI.getModels({ searchQuery: 'fake', limit: 1 })`)).total >= 1, 'AI keywords are searchable');

            await app.evaluate(setSearch('dragon_body'));
            await app.waitFor(`${modelCounter} === 1`, { label: 'the dragon body card' });
            await app.evaluate(clickCard(0));
            await app.waitFor(`!!document.querySelector('[data-testid="ai-apply-tags"]')`, { label: 'the apply-tags button' });
            await app.evaluate(`(() => { document.querySelector('[data-testid="ai-apply-tags"]').click(); return true; })()`);
            await app.waitFor(`window.electronAPI.getModels({ searchQuery: 'dragon_body tag:printed', limit: 1 }).then((p) => p.total === 1)`, { label: 'the suggested tag to be applied' });
            await app.evaluate(`(() => { document.querySelector('button[title="Close (Esc)"]').click(); return true; })()`);
            await app.evaluate(setSearch(''));

            // Switch the assistant back off so later scenarios are unaffected.
            await app.evaluate(`window.electronAPI.updateAiSettings({ enabled: false })`);
            assert.ok(fakeLlm.requests.some((r) => r.url === '/v1/chat/completions'), 'the app talked to the server');
        },
    },
    {
        name: 'settings show slicers, missing-file tools and version',
        async run({ app }) {
            await app.evaluate(`(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Settings')).click(); return true; })()`);
            await app.waitFor(`!!document.querySelector('[data-testid="app-version"]')`, { label: 'the settings dialog' });
            const version = await app.evaluate(`document.querySelector('[data-testid="app-version"]').textContent`);
            assert.match(version, /Version \d+\.\d+\.\d+/);
            const slicers = await app.evaluate(`[...document.querySelectorAll('input[name="default-slicer"]')].length`);
            assert.ok(slicers >= 1, 'at least the system default handler is listed');
            assert.equal(await app.evaluate(`document.querySelector('[data-testid="update-status"]').textContent.trim()`), 'Updates are only checked in installed builds.');
            await app.evaluate(clickButton('Close'));
        },
    },
];
