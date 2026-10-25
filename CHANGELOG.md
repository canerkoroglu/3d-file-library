# Changelog

All notable changes to MeshVault are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- **Renamed from Modelist to MeshVault.** Existing libraries, tags and collections are used as they are,
  and installed copies update in place.
- Large models no longer freeze the window: STL, OBJ, STEP and multi-part 3MF files are parsed in the
  background, and files are streamed from disk instead of copied in memory.
- 3D thumbnails are drawn in a hidden background window, so browsing stays smooth while a library is
  being indexed.
- The viewer shows *Loading model…* while a file is prepared.
- The viewer's lighting is generated locally; before, it was downloaded from the internet each time and
  the window could fail when offline.
- Faster listings and search-index rebuilds on large libraries; the app starts faster because the
  viewer and dialogs load on first use.
- Settings → About: *Open log folder*; the GitHub button is now *Source code*.
- Dropping GLB, glTF, USDZ and STEP files on the window now adds them (before: only STL, 3MF and OBJ).
- Updated to Electron 45, Vite 8, TypeScript 7, Tailwind CSS 4, ESLint 10, three.js 0.186,
  better-sqlite3 13 and chokidar 6. Building the app no longer needs a C++ compiler.

### Security
- The interface is served from a private `app://` address with a strict Content-Security-Policy, in a
  sandbox that cannot open windows, navigate away, use the camera/microphone or embed web views.
- The interface can only read files that are in the library, and can only hand back paths you chose in a
  dialog or dropped on the window.
- Installed builds ignore `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`, and on Windows and
  macOS refuse to start if the app's code was modified (Electron fuses).
- ZIP imports are limited in size and file count to stop archive bombs.
- The AI API key is never sent to a server address other than the one it was saved with; downloaded
  file text is passed to the AI as untrusted data.
- Release builds can be code-signed and notarised (see `docs/code-signing.md`).

### Fixed
- Quitting now waits for the database to close cleanly.
- A file that hangs or crashes the analyser is skipped after a timeout instead of blocking indexing.
- Renaming a file by changing only letter case works on Windows and macOS.
- Packaged Linux builds failed to start (an image library was left inside the app archive).
- GPU memory from textured models is released when the viewer closes.
- "Similar models" no longer mixes results from different embedding models.

## [1.0.2] — 2026-10-22

### Changed
- Release builds are produced per platform and published together, so one failing platform no longer
  breaks a release.
- The `type:` search operator accepts every supported format.

## [1.0.1] — 2026-09-27

### Added
- Semantic search: an embedding model builds an index, and the viewer suggests similar models.
- Printer bed size, with models that do not fit flagged *Exceeds bed*.
- Near-duplicate detection by geometry, not only identical bytes.
- Geometry statistics for GLB/glTF files.
- Bilingual (Turkish and English) AI descriptions and search.
- Docker Compose stack for running the AI model on a GPU server (`deploy/ai`).

### Fixed
- Measurements of multi-part 3MF projects (Bambu Studio, OrcaSlicer, PrusaSlicer) now include every part.

### Security
- Window navigation guards and an allow-list for links opened in the browser.

## [1.0.0] — 2026-09-09

First public release.

### Added
- Watched folders with background indexing, missing-file tracking and restore.
- STL, OBJ, 3MF (including multi-part slicer projects), GLB/glTF, USDZ and STEP support.
- Full-text search with operators, paged and virtualised model grid.
- 3D viewer with wireframe, grid, section view, colours and thumbnail capture.
- Tags, collections, source metadata and bulk actions.
- ZIP import with source links read from READMEs.
- Slicer detection and *Open in Slicer*.
- Optional AI assistant for descriptions and plain-language search.
- In-app updates through GitHub releases; end-to-end test suite.

[Unreleased]: https://github.com/canerkoroglu/3d-file-library/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/canerkoroglu/3d-file-library/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/canerkoroglu/3d-file-library/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/canerkoroglu/3d-file-library/releases/tag/v1.0.0
