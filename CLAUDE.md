# CLAUDE.md

Guidance for working in this repo. Keep it short and current.

## What this is

**MeshVault** — a cross-platform Electron desktop app that catalogues local 3D files
(STL, OBJ, 3MF, GLB/glTF, USDZ, STEP) from watched folders: background indexing, a
full-text + geometry + AI search engine, a 3D viewer, and an optional local-LLM assistant.

Stack: Electron 45, React 19, TypeScript 7 (`@typescript/native`), Vite, Tailwind 4,
Three.js (react-three-fiber), better-sqlite3 (FTS5), Zustand.

> The package is named `meshvault`; the electron-builder `appId` is kept as
> `com.modelist.stlviewer` **on purpose** — changing it would break in-place upgrades and
> auto-update identity for existing installs. Don't "fix" it.

## Commands

```bash
npm run dev         # Vite + Electron, hot reload
npm run typecheck   # tsc for both app (tsconfig.json) and node (tsconfig.node.json)
npm run lint        # eslint .
npm test            # vitest unit tests (tests/**)
npm run coverage    # vitest with v8 coverage (html report in coverage/)
npm run e2e         # builds, then drives the real window over CDP (scripts/e2e)
npm run build[:mac|:win|:linux]   # electron-builder (config in electron-builder.config.cjs)
```

Native modules (better-sqlite3) are rebuilt on `npm install` via node-gyp, which needs a
working **Python**. On macOS with Homebrew `python@3.14`, `pyexpat` is broken — point node-gyp
at the system Python: `export PYTHON=/usr/bin/python3` (already in this machine's `~/.zshrc`).

## Architecture

- **Main process** (`electron/`): `main.ts` (lifecycle, windows, privileged protocols, the hidden
  thumbnail window), `preload.ts` (the only context-bridge API surface), `ipcHandlers.ts` (thin IPC
  over `library.ts`), `library.ts` (queries, FTS maintenance, imports, duplicates), `database.ts`
  (versioned SQLite migrations), `fileWatcher.ts` (chokidar), `thumbnails.ts`, `updater.ts`,
  `settings.ts`, `slicers.ts`, `zipImport.ts`, `paths.ts`.
  - `ai/`: `provider.ts` (OpenAI-compatible / Ollama client), `prompts.ts`, `enrichment.ts`,
    `vector.ts` (embeddings + the semantic "Similar models" index).
  - `analyzers/`: STL / OBJ / 3MF / glTF geometry + sidecar discovery.
  - `indexer/`: a job queue (`index.ts`) feeding a `utilityProcess` worker (`worker.ts`) that
    hashes, measures and finds sidecars off the main thread.
- **Renderer** (`src/`): React components, `store/store.ts` (Zustand), `lib/searchQuery.ts` (the
  query-language parser, shared with the main process), `lib/step.ts` + `lib/threeMf.ts` (format
  loaders), `thumbnails/` (off-screen Three.js renderer).
- **Protocols & CSP**: production serves the renderer over a custom privileged protocol (a stable
  origin so a real CSP can apply) and `media://` for thumbnails. The CSP is injected as a meta tag
  for production builds in `vite.config.ts` — it includes `script-src 'wasm-unsafe-eval'` (STEP's
  OpenCASCADE WASM) and `blob:` (the glTF/3MF loaders), so keep those if you touch it.

## Gotchas (the non-obvious parts)

- **DB migrations** (`database.ts`): keyed on `PRAGMA user_version`, each in a transaction.
  SQLite can't alter a `CHECK` in place, so the `file_type` migration **rebuilds the table** from
  its own `sqlite_master.sql`. Foreign keys are enabled **after** the migration loop, not before —
  otherwise the table rebuild's `DROP TABLE` would cascade-delete every tag/collection link.
- **AI "thinking" models**: reasoning models burn the whole token budget thinking. Ollama is
  auto-detected and driven through its native `/api/chat` with `think: false`; other servers get
  `enable_thinking: false` and a retry without it on HTTP 400. Give enrichment enough `max_tokens`
  (reasoning + JSON). See `ai/provider.ts` / `ai/prompts.ts`.
- **3MF production extension**: Bambu/Orca/Prusa split geometry across `3D/Objects/*.model` parts
  referenced by `p:path`. The stock Three.js loader can't resolve these; `lib/threeMf.ts` (viewer)
  and `analyzers/threemf.ts` (indexer) handle the cross-part resolution. Keep them in sync.
- **Geometry stats**: computed for STL/OBJ/3MF and GLB/glTF; STEP and USDZ render but their
  `tris:`/`size:` stats are not indexed yet.
- **Releases**: a `v*` tag runs `.github/workflows/release.yml`, which builds each OS separately
  (no publish) and then a single job uploads all installers to one draft GitHub release — this
  avoids the per-platform publish failures the old all-in-one job hit. Unsigned local builds run on
  the build machine (no quarantine); downloaded unsigned builds hit Gatekeeper / SmartScreen.

## Conventions

- Match the surrounding style; the code favours small pure functions with unit tests in `tests/`.
- Run `npm run typecheck && npm run lint && npm test` before committing. CI runs all three plus the
  build matrix; a tag additionally runs the release workflow.
