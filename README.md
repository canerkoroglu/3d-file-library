# MeshVault

**A fast, private desktop library for your 3D-printing files.**

Point MeshVault at the folders where you keep your models. It catalogues every STL, 3MF, OBJ,
STEP, GLB/glTF and USDZ file inside them, renders thumbnails, measures the geometry, reads the
READMEs and licences that came with your downloads, and gives you instant search across all of it
— without uploading anything anywhere.

[![CI](https://github.com/canerkoroglu/3d-file-library/actions/workflows/ci.yml/badge.svg)](https://github.com/canerkoroglu/3d-file-library/actions/workflows/ci.yml)
![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-informational)
![License](https://img.shields.io/badge/license-MIT-green)

> MeshVault was called **Modelist** up to v1.0.2. Your existing library, tags and collections are
> picked up automatically, and installed copies update in place.

---

## Highlights

- **Your folders stay the source of truth.** Watched folders are kept in sync as files change. A file
  that disappears — deleted, moved, or on an unplugged drive — is flagged *missing* instead of
  removed, so its tags and notes survive until it comes back.
- **Every common format.** STL, OBJ, 3MF (including Bambu Studio / OrcaSlicer / PrusaSlicer projects),
  STEP, GLB/glTF and USDZ all get a thumbnail and open in the 3D viewer.
- **Search that understands models.** Full-text search over names, folders, tags, notes, READMEs and
  slicer settings, plus operators such as `tag:printed`, `type:3mf`, `tris:>100k` or `size:<50`.
- **Made for downloads.** Drop a Thingiverse, Printables or MyMiniFactory ZIP on the window: it is
  extracted next to your models and the source, author and licence are filled in from the README.
- **Useful measurements.** Triangle count, bounding box and volume for every model; set your printer's
  build volume and anything that will not fit is flagged.
- **Find duplicates** — identical files and the same geometry exported twice.
- **Open in your slicer** with one click. Bambu Studio, OrcaSlicer, PrusaSlicer, Cura and more are
  detected automatically.
- **Optional local AI.** Connect Ollama, LM Studio or any OpenAI-compatible server to get descriptions,
  categories, bilingual keywords, plain-language search and "similar models". Nothing leaves your
  network unless you point it elsewhere.
- **Private and hardened by design.** No accounts, no telemetry; a sandboxed interface that cannot read
  files outside your library. See [Security](docs/security.md).

## Install

Download the installer for your system from the
[latest release](https://github.com/canerkoroglu/3d-file-library/releases/latest):

| System | File |
| --- | --- |
| Windows 10/11 (x64) | `MeshVault-<version>-win-x64.exe` (installer) or the portable `.exe` |
| macOS (Apple silicon) | `MeshVault-<version>-mac-arm64.dmg` |
| Linux (x64) | `MeshVault-<version>-linux-*.AppImage` |

Builds that are not yet code-signed show a one-time warning:
**Windows** — *More info → Run anyway*; **macOS** — right-click the app → *Open*;
**Linux** — `chmod +x MeshVault-*.AppImage` before running. Installed copies keep themselves up to
date (Settings → About).

## Quick start

1. **Add a watched folder** — sidebar → *Watched folders* → **+**, and pick the folder with your models.
   MeshVault imports everything inside it, including sub-folders, and indexes it in the background.
2. **Search** — type in the search box, or press the ✨ button and describe what you want in plain words
   (needs the AI assistant).
3. **Open a model** — click a card for the 3D viewer, details, tags, collections and *Open in Slicer*.
4. **Organise** — tag models, group them into collections, or select several (⌘/Ctrl-click,
   Shift-click) and tag them all at once.

The [User guide](docs/user-guide.md) covers every feature, keyboard shortcut and search operator.

## Documentation

| For | Read |
| --- | --- |
| Using the app | [User guide](docs/user-guide.md) · [AI assistant](docs/ai-assistant.md) · [Troubleshooting](docs/troubleshooting.md) |
| Hosting the AI model on a GPU server | [deploy/ai](deploy/ai/README.md) |
| Working on the code | [Development](docs/development.md) · [Architecture](docs/architecture.md) · [Contributing](CONTRIBUTING.md) |
| Shipping releases | [Releasing](docs/releasing.md) · [Code signing](docs/code-signing.md) |
| Security | [Security model](docs/security.md) · [Reporting a vulnerability](SECURITY.md) |
| What changed | [Changelog](CHANGELOG.md) |

## For developers

```bash
git clone https://github.com/canerkoroglu/3d-file-library.git
cd 3d-file-library
npm install        # Node.js 22.22+; no C++ toolchain needed
npm run dev        # the app with hot reload
```

Before sending changes: `npm run typecheck && npm run lint && npm test && npm run e2e`.
Details are in [Development](docs/development.md).

Built with Electron 45, React 19, TypeScript 7, three.js / react-three-fiber, Tailwind CSS 4,
SQLite (better-sqlite3 + FTS5), Zustand and Vite 8.

## License

[MIT](LICENSE) © Caner Köroğlu
