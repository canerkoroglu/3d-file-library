# Modelist

A desktop library for 3D printing files (STL, 3MF, OBJ). Point it at the folders where you keep your models and it keeps a searchable, thumbnailed catalogue of everything in them.

## Features

- **Watched folders**: add a folder and every model inside it is imported and kept in sync as files change. Files that disappear (deleted, moved, or on an unplugged drive) are flagged as missing rather than removed, so their tags, notes and collections survive; they are restored automatically when they come back, and can be forgotten from Settings.
- **Background indexing**: each file is hashed and measured in a separate worker process. Triangle count, bounding box (mm) and volume are extracted from STL, OBJ and 3MF files; 3MF project files also yield the title, designer, slicer, printer, filament and layer height.
- **Sidecar awareness**: a README, LICENSE or preview image sitting next to a model (including the `files/` + `images/` layout of Thingiverse and Printables downloads) is indexed and used for the thumbnail.
- **Thumbnails**: embedded 3MF previews, sidecar images, or a 3D render produced in the background. You can also capture your own view from the viewer.
- **Full-text search**: an SQLite FTS5 trigram index over names, folder paths, tags, notes, source metadata, slicer settings and README text, with a small query language (below).
- **Organization**: many-to-many collections, colour-coded tags, source metadata (site, author, license, URL, notes).
- **ZIP import**: drop a Thingiverse, Printables or MyMiniFactory download on the window (or use *Import ZIP…* in the sidebar) and it is extracted into a watched folder, one sub-folder per archive, so the README, license and preview images are indexed with the models. Links to the model page found in a README fill in the source and URL automatically. Dropping STL, 3MF or OBJ files registers them in place.
- **Duplicate finder**: exact duplicates are detected from stored content hashes without rescanning your disk.
- **3D viewer**: orbit, zoom and pan with Z-up orientation matching your slicer. Toolbar with auto-rotate (Space), wireframe (W), grid (G), reset view (R), a section-height slider that cuts the model open, a model colour picker, and file colours for 3MF projects.
- **Bulk actions**: hover a card for its checkbox, ⌘/Ctrl-click to toggle, Shift-click for ranges, ⌘/Ctrl+A for everything loaded, then add or remove tags, add to a collection or remove from the library in one go.
- **Slicer integration**: installed slicers (Bambu Studio, OrcaSlicer, PrusaSlicer, SuperSlicer, Cura, ideaMaker, Lychee, CHITUBOX and more) are detected on macOS, Windows and Linux. Pick a default in Settings or choose per model from the viewer; anything the scan misses can be added by hand.
- **Cross-platform**: macOS, Windows and Linux builds.

## Search syntax

Type plain words to search everything. Add operators to narrow down:

| Query | Meaning |
| --- | --- |
| `benchy hull` | words must all appear somewhere (name, folder, tags, notes, README, …) |
| `"low poly"` | exact phrase |
| `tag:printed` | has the tag (repeat to require several) |
| `type:3mf` | file type: `stl`, `3mf` or `obj` |
| `source:printables` | source site from metadata |
| `author:name` | author from metadata or designer from the 3MF |
| `license:cc-by` | license from metadata or a detected LICENSE / README |
| `tris:>100k` `tris:<2m` | triangle count above / below a value |
| `size:<50` `size:>200` | largest dimension in millimetres |
| `has:readme` `has:thumbnail` | only models with a README beside them / with a preview |
| `is:missing` `is:available` | files that cannot be found on disk / files that are present |

Results are ranked by relevance when there is free text; pick another sort order from the dropdown.

## Tech stack

Electron, React 19, TypeScript, Three.js (react-three-fiber), Tailwind CSS, better-sqlite3 with FTS5, Zustand, Vite.

## Development

```bash
npm install      # also rebuilds native modules for Electron
npm run dev      # Vite + Electron with hot reload
npm run typecheck
npm run lint
npm test         # vitest unit tests (analyzers, query parser, SQL builder)
```

To run against a separate library profile (for example while testing), set `MODELIST_USER_DATA=/path/to/profile`.

### Building

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

Installers are written to `release/`. CI builds all three on every push to `main`.

### Releases and auto-update

```bash
npm version minor          # bumps package.json and creates the tag v1.x.0
git push --follow-tags
```

The tag triggers the release workflow, which builds macOS, Windows and Linux installers and uploads them to a **draft** GitHub release together with the update manifests. Publish the draft and installed copies pick it up: the app checks on launch and every six hours (switchable in Settings), shows a banner, downloads on request and installs on restart.

macOS can only self-update when the app is code-signed; the CI build is unsigned, so on macOS the banner links to the release page instead. Sign locally (`npm run build:mac` with an Apple identity) to get in-place updates there.

## Project structure

```
electron/
  main.ts              app lifecycle, window, media:// protocol
  preload.ts           context-bridge API exposed to the renderer
  ipcHandlers.ts       thin IPC layer over library.ts
  database.ts          versioned SQLite migrations (PRAGMA user_version)
  library.ts           queries, FTS index maintenance, imports, duplicates
  fileWatcher.ts       chokidar watchers + folder reconciliation
  thumbnails.ts        render queue; the renderer draws 3D previews on request
  updater.ts           electron-updater wiring (GitHub releases)
  slicers.ts           slicer discovery per platform and launching
  zipImport.ts         safe extraction of downloaded archives into a watched folder
  settings.ts          key/value preferences stored in the database
  indexer/index.ts     job queue feeding the worker process
  indexer/worker.ts    utility process: hashing, mesh stats, sidecars, images
  analyzers/           STL / OBJ / 3MF parsers, sidecar discovery
src/
  components/          React UI (virtualised grid, viewer, sidebar, modals)
  store/store.ts       Zustand state
  lib/searchQuery.ts   query language parser (shared with the main process)
  thumbnails/          off-screen Three.js thumbnail renderer
tests/                 vitest unit tests
```

## How data flows

1. A watched folder is scanned (or the watcher reports a change) and `importModel` inserts a row and its FTS document.
2. The indexer queue sends the model to the worker, which hashes the file, parses geometry and metadata, looks for sidecars and writes any embedded or sidecar preview as the thumbnail.
3. The main process applies the result, refreshes the FTS document and, if the model still has no good preview, asks the renderer to draw one.
4. The renderer is notified (debounced) and reloads the current view.

Thumbnail sources are ranked so a stronger preview is never replaced by a weaker one: user capture > embedded 3MF image > matching sidecar image > 3D render > generic folder image.

Watched folders are polled every ten seconds. When a folder's root disappears (external drive unplugged) its watcher is released and every model in it is flagged missing; when it returns, the watcher restarts and a reconciliation pass restores the models. Missing files sort to the end of every listing and are excluded from the duplicate finder.

## License

MIT
