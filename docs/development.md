# Development

Everything you need to build, run, test and change MeshVault. For how the pieces fit together, read
[architecture.md](architecture.md) first.

- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Testing](#testing)
- [Debugging](#debugging)
- [Conventions](#conventions)
- [Common tasks](#common-tasks)
- [Toolchain notes](#toolchain-notes)

## Requirements

- **Node.js 22.22 or newer** (CI uses Node 24, which is also what Electron 45 embeds).
- **Git.**
- No C++ compiler or Python: the native modules (better-sqlite3, sharp) ship prebuilt Node-API
  binaries that work in Electron as they are.
- To build installers for another operating system, see [Releasing](releasing.md).

## Getting started

```bash
git clone https://github.com/canerkoroglu/3d-file-library.git
cd 3d-file-library
npm install
npm run dev
```

`npm run dev` starts Vite and Electron together. Renderer changes hot-reload; main-process changes
restart Electron. DevTools open in a separate window, and renderer errors are echoed in the terminal.

Use a throwaway library while developing so you never touch your real catalogue:

```bash
MESHVAULT_USER_DATA=/tmp/meshvault-dev MESHVAULT_WATCH_FOLDERS=~/Models/test npm run dev
```

| Variable | Effect |
| --- | --- |
| `MESHVAULT_USER_DATA` | Library folder to use instead of the default |
| `MESHVAULT_WATCH_FOLDERS` | Folders to watch at startup, separated by `:` (`;` on Windows) |
| `MESHVAULT_SOFTWARE_GL=1` | Render WebGL on the CPU (SwiftShader) — for VMs and CI without a GPU |

The older `MODELIST_*` names are still accepted.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | App with hot reload |
| `npm run typecheck` | TypeScript 7 on the app (`tsconfig.json`) and the Vite config (`tsconfig.node.json`) |
| `npm run lint` | ESLint 10 with typescript-eslint and the React Compiler rules |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run e2e` | Builds, then drives the real app through the end-to-end scenarios |
| `npm run build` | Type-check, build, and package installers for the current OS |
| `npm run build:win` / `build:mac` / `build:linux` | Package for one platform |

Before you push: `npm run typecheck && npm run lint && npm test && npm run e2e`. CI runs the same
checks plus `npm audit` on the shipped dependencies.

## Testing

### Unit tests (`tests/`)

Fast tests that run in Node against the real SQLite driver:

| File | Covers |
| --- | --- |
| `database.test.ts` | migrations from a v1 database, page queries, search rebuild, rename, similarity |
| `indexer.test.ts` | hung and crashing workers (Electron's utility process is faked) |
| `zipImport.test.ts`, `zipLimits.test.ts` | path safety and size/entry limits |
| `analyzers.test.ts` | STL / OBJ / 3MF / glTF parsing and sidecars |
| `searchQuery.test.ts`, `queryBuilder.test.ts` | the search syntax and the SQL it produces |
| `meshTransfer.test.ts` | worker ↔ page mesh transfer, `model://` URL parsing |
| `security.test.ts` | user-granted paths, app URL |
| `ai.test.ts`, `aiProvider.test.ts`, `vector.test.ts` | prompts, reply validation, embeddings |

Modules that import `electron` are tested with `vi.mock('electron', …)`; everything else runs as is.

### End-to-end tests (`scripts/e2e/`)

`npm run e2e` builds the app, generates a throwaway library (STL, OBJ, 3MF projects, a
Thingiverse-style folder, ZIP archives and enough files to page), starts a fake AI server, launches the
app with a temporary profile and drives it over the Chrome DevTools Protocol. No browser automation
library is needed.

```bash
npm run e2e -- --no-build              # reuse the last build
npm run e2e -- --filter "zip"          # only scenarios whose name contains "zip"
npm run e2e -- --keep                  # keep the fixtures and profile for inspection
MESHVAULT_APP=./release/linux-unpacked/meshvault npm run e2e -- --no-build   # test a packaged app
```

On Linux without a display, use `xvfb-run -a npm run e2e` together with `MESHVAULT_SOFTWARE_GL=1`.
CI runs the suite on macOS, Windows and Linux.

Writing scenarios: wait for conditions with `app.waitFor(…)` rather than sleeping; the grid is
virtualised and re-renders asynchronously. `app.dropFiles([path])` performs a real drag-and-drop, which
is the only way (besides a dialog) the app accepts a path.

## Debugging

- **Main process logs** go to the terminal in development and to `<library folder>/logs/main.log` in
  installed builds (Settings → About → **Open log folder**). Rotated at 5 MB.
- **Renderer:** DevTools open automatically with `npm run dev`.
- **Main process debugger:** `npm run dev` and attach to Electron with your editor's Node debugger, or
  add `--inspect` to the Electron command. (Installed builds ignore `--inspect`; see
  [security.md](security.md).)
- **A file that will not index:** search `has:thumbnail` / check the log for `[Indexer]` lines; the
  worker logs each failure with the reason.

## Conventions

- **TypeScript strict mode**, no `any` in new code unless an external API forces it.
- **The renderer is untrusted.** Every IPC handler validates its arguments; file access goes by catalogue
  id or through `isGranted()`. See [Adding an IPC call](architecture.md#protocols-and-ipc).
- **Main process owns writes.** Utility processes and workers compute and return results.
- **State that follows a prop** is adjusted during render (React's recommended pattern), not with an
  effect that calls `setState`; the lint rules enforce this.
- **three.js objects are mutated in place** on purpose; mark such lines with a short
  `eslint-disable-next-line react-hooks/immutability -- reason` comment.
- **Comments explain why**, not what. User-facing text is plain English, sentence case.
- **Commits:** one logical change each, imperative summary line (`Viewer: add section view`), body
  explaining the reason when it is not obvious. See [CONTRIBUTING](../CONTRIBUTING.md).

## Common tasks

### Add a file format

1. Add the extension to `SUPPORTED_EXTENSIONS` and `fileTypeOf` in `electron/library/core.ts`, and the
   type to `FileType` (`src/types/index.ts`).
2. Widen the `file_type` CHECK constraint with a migration (see `database.ts`, version 6, for how).
3. Add an analyzer in `electron/analyzers/` and call it from `indexer/worker.ts`.
4. Teach `src/lib/modelLoader.ts` to load it — in the mesh worker if its loader works without the DOM.
5. Add it to the import dialog filters (`ipcHandlers.ts`) and the drop pattern (`App.tsx`).
6. Add analyzer tests and an e2e fixture.

### Change the database schema

Append a migration (next version number) to `MIGRATIONS` in `electron/database.ts`. It must work on any
older database; never edit a released migration. Add a check to `tests/database.test.ts`.

### Add a setting

Store it with `getSetting` / `setSetting` (`electron/settings.ts`); expose a getter/setter over IPC with
validation; add it to the store slice that owns the area and to the Settings dialog.

## Toolchain notes

- **TypeScript 7** (the native compiler) is installed as `@typescript/native` and runs
  `npm run typecheck`. **TypeScript 6** is installed under the `typescript` name because typescript-eslint
  needs the compiler API, which TypeScript 7 does not offer yet. This is Microsoft's recommended
  side-by-side setup; switch typescript-eslint over once TypeScript 7.1 ships its API.
- **Tailwind CSS 4** is configured in CSS (`src/styles/globals.css`), not in a JS config file. Theme
  colours map to `--mv-*` variables that switch between light and dark.
- **Vite 8** builds the renderer, the preload (CommonJS, for the sandbox) and the main process and
  indexer worker (ESM). Native modules are left external.
- **Electron builder settings** are in `electron-builder.config.cjs` (signing, fuses, ASAR unpacking).
