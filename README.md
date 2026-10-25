# MeshVault

A desktop library for 3D files (STL, OBJ, 3MF, GLB/glTF, USDZ and STEP). Point it at the folders where you keep your models and it keeps a searchable, thumbnailed catalogue of everything in them.

> MeshVault was called *Modelist* up to v1.0.2. Existing libraries are picked up automatically, and installed copies update in place.

## Features

- **Watched folders**: add a folder and every model inside it is imported and kept in sync as files change. Files that disappear (deleted, moved, or on an unplugged drive) are flagged as missing rather than removed, so their tags, notes and collections survive; they are restored automatically when they come back, and can be forgotten from Settings.
- **Formats**: STL, OBJ, 3MF (including slicer project files and Bambu/Orca/Prusa 3MFs whose geometry is split across parts), GLB/glTF, USDZ and STEP — STEP (CAD) is tessellated on load. All render in the 3D viewer and get thumbnails.
- **Background indexing**: each file is hashed and measured in a separate worker process. Triangle count, bounding box (mm) and volume are extracted from STL, OBJ and 3MF files, and triangle count and bounding box from GLB/glTF; 3MF project files also yield the title, designer, slicer, printer, filament and layer height. STEP and USDZ render but their geometry stats are not yet indexed.
- **Sidecar awareness**: a README, LICENSE or preview image sitting next to a model (including the `files/` + `images/` layout of Thingiverse and Printables downloads) is indexed and used for the thumbnail.
- **Thumbnails**: embedded 3MF previews, sidecar images, or a 3D render produced in the background. You can also capture your own view from the viewer.
- **Full-text search**: an SQLite FTS5 trigram index over names, folder paths, tags, notes, source metadata, slicer settings and README text, with a small query language (below).
- **Organization**: many-to-many collections, colour-coded tags, source metadata (site, author, license, URL, notes).
- **ZIP import**: drop a Thingiverse, Printables or MyMiniFactory download on the window (or use *Import ZIP…* in the sidebar) and it is extracted into a watched folder, one sub-folder per archive, so the README, license and preview images are indexed with the models. Links to the model page found in a README fill in the source and URL automatically. Dropping STL, 3MF or OBJ files registers them in place.
- **Duplicate finder**: exact duplicates (identical bytes) and near-duplicates — same geometry (triangle count and bounding box) but different files, such as the same model re-exported — are found from the stored index without rescanning your disk.
- **Printer fit check**: set your printer's build volume in Settings and any model that will not fit in any orientation is flagged *Exceeds bed* on its card and in the viewer (millimetre formats: STL, OBJ, 3MF, STEP).
- **3D viewer**: renders every supported format (STEP is tessellated on load); orbit, zoom and pan with Z-up orientation matching your slicer. Toolbar with auto-rotate (Space), wireframe (W), grid (G), reset view (R), a section-height slider that cuts the model open, a model colour picker, and file colours for 3MF projects.
- **Bulk actions**: hover a card for its checkbox, ⌘/Ctrl-click to toggle, Shift-click for ranges, ⌘/Ctrl+A for everything loaded, then add or remove tags, add to a collection or remove from the library in one go.
- **AI assistant (optional, local)**: point the app at any OpenAI-compatible server (Ollama or LM Studio on your machine, or a remote host) and pick a model such as Qwen3 or Gemma. The assistant writes a one-line description, a category, bilingual search keywords and tag suggestions for each model, all of which become searchable, and turns plain-language questions ("small printed dragons from last month", in English or Turkish) into the search syntax. With an embedding model it also builds a semantic index for **Similar models** suggestions. Nothing is sent anywhere but the server you configure.
- **Slicer integration**: installed slicers (Bambu Studio, OrcaSlicer, PrusaSlicer, SuperSlicer, Cura, ideaMaker, Lychee, CHITUBOX and more) are detected on macOS, Windows and Linux. Pick a default in Settings or choose per model from the viewer; anything the scan misses can be added by hand.
- **Cross-platform**: macOS, Windows and Linux builds.

## Search syntax

Type plain words to search everything. Add operators to narrow down:

| Query | Meaning |
| --- | --- |
| `benchy hull` | words must all appear somewhere (name, folder, tags, notes, README, …) |
| `"low poly"` | exact phrase |
| `tag:printed` | has the tag (repeat to require several) |
| `type:3mf` | file type: `stl`, `3mf`, `obj`, `glb`, `usdz` or `step` |
| `source:printables` | source site from metadata |
| `author:name` | author from metadata or designer from the 3MF |
| `license:cc-by` | license from metadata or a detected LICENSE / README |
| `tris:>100k` `tris:<2m` | triangle count above / below a value |
| `size:<50` `size:>200` | largest dimension in millimetres |
| `has:readme` `has:thumbnail` | only models with a README beside them / with a preview |
| `is:missing` `is:available` | files that cannot be found on disk / files that are present |
| `category:kitchen` | category assigned by the AI assistant |
| `added:>7d` `added:<2026-01-01` `modified:>2w` | when the model was added or the file changed; relative ages use d, w, m, y |

Results are ranked by relevance when there is free text; pick another sort order from the dropdown.

## AI assistant

Settings → AI assistant. Choose a server preset or enter a base URL ending in `/v1` (for example `https://llm.example.com/v1`), an optional API key, and a model name; *Test connection* lists the models the server offers and picks one if the configured name is missing. Then:

- **Ask**: the sparkle button in the search box takes a plain-language request and applies the translated query, showing what it understood so you can adjust it.
- **Analyse**: from the viewer, the bulk action bar, or *Settings → Analyse models without a description*. Turn on *Analyse new models automatically* to process imports as they arrive. Results appear in the viewer's AI section; `category:` searches use them.
- **Similar models**: set an *Embedding model* (for example `nomic-embed-text`) and click *Build semantic index*; the viewer then suggests similar models by meaning and shape. It works on filenames alone but is far better after Analyse has described your library.

Ollama is detected automatically and driven through its native API with model "thinking" switched off, because reasoning models otherwise spend their whole answer on it. Other servers get the OpenAI-compatible API with `enable_thinking: false`; if a server cannot switch thinking off, use a non-reasoning model. The API key is stored encrypted with the operating system's keychain facilities where available.

To host the server on a GPU box, `deploy/ai/` contains a Docker Compose stack (Ollama) that serves both the chat and the embedding model — see [deploy/ai/README.md](deploy/ai/README.md).

## Tech stack

Electron 45, React 19, TypeScript 7, Three.js (react-three-fiber), Tailwind CSS 4, better-sqlite3 13 with FTS5, Zustand, Vite 8, ESLint 10.

TypeScript 7 (the native compiler, installed as `@typescript/native`) runs `npm run typecheck`. TypeScript 6 stays installed under the `typescript` name because typescript-eslint needs the compiler API that TypeScript 7 does not offer yet; this is Microsoft's recommended side-by-side setup.

## Development

```bash
npm install      # native modules ship prebuilt Node-API binaries: no compiler or rebuild needed
npm run dev      # Vite + Electron with hot reload
npm run typecheck
npm run lint
npm test         # vitest unit tests (analyzers, query parser, database, indexer, ZIP import…)
npm run e2e      # builds, then drives the real window through the scenarios in scripts/e2e
```

The end-to-end suite generates a throwaway library (STL, OBJ, 3MF, a Thingiverse-style folder, a zip and enough files to page), starts the app with a temporary profile and controls it over the Chrome DevTools Protocol; no extra dependencies. `--no-build` reuses the last build, `--filter <text>` runs matching scenarios, `--keep` leaves the fixtures behind, and `MESHVAULT_APP=<executable>` points it at a packaged build. CI runs it on macOS, Windows and Linux.

Environment variables for scripted setups (the older `MODELIST_*` names still work):

- `MESHVAULT_USER_DATA=/path/to/profile` keeps a separate library.
- `MESHVAULT_WATCH_FOLDERS=/a:/b` registers watched folders at startup.
- `MESHVAULT_SOFTWARE_GL=1` renders WebGL in software, for machines without a usable GPU (CI, some VMs).

The main-process log is written to `<user data>/logs/main.log` (Settings → About → Open log folder).

### Building

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

Installers are written to `release/`. CI builds all three on every push to `main`. The build settings live in `electron-builder.config.cjs`.

### Releases and auto-update

```bash
npm version minor          # bumps package.json and creates the tag v1.x.0
git push --follow-tags
```

The tag triggers the release workflow, which builds macOS, Windows and Linux installers and uploads them to a **draft** GitHub release together with the update manifests. Publish the draft and installed copies pick it up: the app checks on launch and every six hours (switchable in Settings), shows a banner, downloads on request and installs on restart.

How the app is protected is described in [docs/security.md](docs/security.md). Release builds are code-signed when the signing secrets are configured in the repository, and unsigned otherwise; see [docs/code-signing.md](docs/code-signing.md). Unsigned macOS builds cannot update themselves, so there the banner links to the release page instead.

## Project structure

```
electron/
  main.ts              app lifecycle, windows, media:// protocol, shutdown
  security.ts          app:// protocol, window hardening, user-granted paths
  modelProtocol.ts     model://library/<id> streams library files to the renderer
  logger.ts            mirrors console output to logs/main.log
  preload.ts           context-bridge API exposed to the renderer
  ipcHandlers.ts       thin IPC layer over the library, with argument checks
  database.ts          versioned SQLite migrations (PRAGMA user_version)
  library/             queries, FTS index, imports/missing files, updates, AI data, duplicates/similarity
  fileWatcher.ts       chokidar watchers + folder reconciliation
  thumbnails.ts        render queue; a hidden window draws 3D previews on request
  updater.ts           electron-updater wiring (GitHub releases)
  ai/provider.ts       OpenAI-compatible / Ollama client, settings, key storage
  ai/prompts.ts        prompt construction and reply validation
  ai/enrichment.ts     background queue that describes models
  ai/vector.ts         text embeddings + the semantic "similar models" index
  slicers.ts           slicer discovery per platform and launching
  zipImport.ts         safe extraction of downloaded archives into a watched folder
  settings.ts          key/value preferences stored in the database
  indexer/index.ts     job queue feeding the worker process
  indexer/worker.ts    utility process: hashing, mesh stats, sidecars, images
  analyzers/           STL / OBJ / 3MF / glTF parsers, sidecar discovery
src/
  components/          React UI (virtualised grid, sidebar, modals)
  components/viewer/   3D viewer canvas and the side-panel sections
  store/               Zustand state, one slice per area (library, selection, assistant…)
  lib/modelLoader.ts   loads models via model:// and the mesh worker, disposes GPU resources
  workers/meshWorker.ts parses STL / OBJ / STEP / multi-part 3MF off the UI thread
  lib/searchQuery.ts   query language parser (shared with the main process)
  thumbnails/          Three.js thumbnail renderer (runs in the hidden render window)
tests/                 vitest unit tests
scripts/e2e/           end-to-end runner, fixtures and scenarios
deploy/ai/             Docker Compose (Ollama) GPU stack for the AI backend
```

## How data flows

1. A watched folder is scanned (or the watcher reports a change) and `importModel` inserts a row and its FTS document.
2. The indexer queue sends the model to the worker, which hashes the file, parses geometry and metadata, looks for sidecars and writes any embedded or sidecar preview as the thumbnail.
3. The main process applies the result, refreshes the FTS document and, if the model still has no good preview, asks the hidden render window to draw one (the window opens when there is work and closes after a minute idle).
4. The renderer is notified (debounced) and reloads the current view.

Thumbnail sources are ranked so a stronger preview is never replaced by a weaker one: user capture > embedded 3MF image > matching sidecar image > 3D render > generic folder image.

Watched folders are polled every ten seconds. When a folder's root disappears (external drive unplugged) its watcher is released and every model in it is flagged missing; when it returns, the watcher restarts and a reconciliation pass restores the models. Missing files sort to the end of every listing and are excluded from the duplicate finder.

## License

MIT
