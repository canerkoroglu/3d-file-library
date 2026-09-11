#!/usr/bin/env node
// End-to-end test runner: builds the app, creates a throwaway library and profile,
// launches the real Electron window and drives it through the scenarios.
//
//   npm run e2e                 build + run everything
//   npm run e2e -- --no-build   reuse the existing dist/ and dist-electron/
//   npm run e2e -- --filter zip run only scenarios whose name contains "zip"
//   MODELIST_APP=<packaged executable> npm run e2e -- --no-build   test a packaged build
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchApp, PROJECT_ROOT } from './driver.mjs';
import * as fixtures from './fixtures.mjs';
import { scenarios } from './scenarios.mjs';
import { startFakeLlm } from './fakeLlm.mjs';

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const filterIndex = args.indexOf('--filter');
const filter = filterIndex >= 0 ? args[filterIndex + 1] : null;
const keep = args.includes('--keep');
// Safety net for a truly stuck scenario. Must exceed the sum of a scenario's own internal
// waits (the import scenario waits 90s for imports + 180s for indexing/rendering) so a cold,
// under-load run isn't killed mid-wait.
const SCENARIO_TIMEOUT_MS = 300_000;

function step(message) {
    console.log(`\n▶ ${message}`);
}

if (!noBuild) {
    step('Building the app');
    const build = spawnSync('npx', ['vite', 'build'], { cwd: PROJECT_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    if (build.status !== 0) {
        console.error('Build failed');
        process.exit(1);
    }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelist-e2e-'));
const libraryDir = path.join(tmpDir, 'library');
const profileDir = path.join(tmpDir, 'profile');
fs.mkdirSync(libraryDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

step(`Creating fixtures in ${tmpDir}`);
const library = await fixtures.createLibrary(libraryDir);

step('Starting the fake language-model server');
const fakeLlm = await startFakeLlm();
console.log(`  ${fakeLlm.baseUrl}`);

step('Launching the app');
const app = await launchApp({
    profileDir,
    watchFolders: [libraryDir],
    port: Number(process.env.CDP_PORT ?? 9333),
    appPath: process.env.MODELIST_APP,
});

const context = { app, library, profileDir, tmpDir, fixtures, fakeLlm };
const selected = scenarios.filter((s) => !filter || s.name.includes(filter));
const results = [];

for (const scenario of selected) {
    step(scenario.name);
    const started = Date.now();
    try {
        await Promise.race([
            scenario.run(context),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Scenario timed out after ${SCENARIO_TIMEOUT_MS}ms`)), SCENARIO_TIMEOUT_MS)),
        ]);
        results.push({ name: scenario.name, ok: true, ms: Date.now() - started });
        console.log(`  ✓ ${scenario.name} (${Date.now() - started}ms)`);
    } catch (error) {
        results.push({ name: scenario.name, ok: false, ms: Date.now() - started, error });
        console.log(`  ✗ ${scenario.name}: ${error.message}`);
    }
}

await app.close();
await fakeLlm.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
if (failed.length > 0) {
    console.log(`\nApp log: ${app.logFile}`);
    const tail = fs.existsSync(app.logFile) ? fs.readFileSync(app.logFile, 'utf8').split('\n').slice(-25).join('\n') : '(missing)';
    console.log(`--- last lines of the app log ---\n${tail}`);
}
if (!keep && failed.length === 0) fs.rmSync(tmpDir, { recursive: true, force: true });
else console.log(`Fixtures kept in ${tmpDir}`);

process.exit(failed.length > 0 ? 1 : 0);
