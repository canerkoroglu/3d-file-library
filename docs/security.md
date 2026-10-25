# Security model

MeshVault is a local app: it reads 3D files from folders you choose, stores a catalogue in a local
SQLite database and talks to the network only for update checks and the optional AI server you
configure. The design goal is that **even if the interface (renderer) were compromised — for example
by a malicious file exploiting a parser bug — it cannot read or change anything outside your library.**

## Process boundaries

| Part | Runs as | Can do |
| --- | --- | --- |
| Main process (`electron/`) | Node.js | Everything: database, files, dialogs, network |
| Renderer windows (`src/`) | Sandboxed Chromium page, `contextIsolation`, no Node.js | Only the functions in `electron/preload.ts` |
| Mesh worker (`src/workers/`) | Web Worker inside the sandboxed page | Parse bytes it is given |
| Indexer worker (`electron/indexer/worker.ts`) | Electron utility process | Read and hash files it is told to; no database access |

## What the renderer can and cannot do

- **Files it can read:** only library files, by id, through `model://library/<id>`; thumbnails only
  from the thumbnail folder through `media://`. There is no "read any path" call.
- **Paths it can supply:** none of its own. Folders to watch always come from the system dialog.
  Files to import (loose files or ZIP archives) are accepted only if the user picked them in a
  dialog or dropped them on the window during this session. Dropped paths are resolved in the preload
  with `webUtils.getPathForFile`, which only knows real dropped files, so the page cannot invent them
  (`electron/security.ts`, "granted paths").
- **Arguments:** IPC handlers check types, ids and lengths before touching the database
  (`electron/ipcHandlers.ts`).
- **Navigation and windows:** every window refuses navigation away from `app://bundle`, new windows,
  `<webview>` tags and all permission requests (camera, microphone, notifications…). `https://` links
  open in the system browser; nothing else is opened.
- **Content-Security-Policy:** production pages may only load scripts from the app itself
  (`script-src 'self' 'wasm-unsafe-eval'`), with no inline scripts and no network origins.

## The packaged app

- The UI is served from the custom `app://bundle` protocol, not `file://`, so the `file://`
  extra privileges are switched off.
- **Electron fuses** (in `electron-builder.config.cjs`) are set at build time: `ELECTRON_RUN_AS_NODE`,
  `NODE_OPTIONS` and `--inspect` are ignored, and on macOS/Windows the app refuses to start if its
  `app.asar` was modified (embedded ASAR integrity + load only from ASAR).
- Code signing (see `code-signing.md`) proves the installers come from you; updates are downloaded
  over HTTPS from GitHub releases and checked against the SHA-512 in the release manifest.

## Secrets

The AI server's API key is encrypted with the operating system's key store (`safeStorage`) and
decrypted only in the main process. It is only sent to the server address saved with it.

## Untrusted content

- **ZIP archives:** entries escaping the destination are rejected; archive size, entry count and
  total extracted size are limited.
- **3D files:** parsed in the indexer utility process and in the mesh worker, off the main process,
  with a per-file timeout; a file that repeatedly crashes the parser is skipped.
- **README / metadata text:** displayed as plain text, never as HTML.
- **AI output:** file details are sent to the model marked as data, with instructions to ignore any
  instructions inside them. Replies are validated: categories come from a fixed list, suggested tags
  must already exist, lengths are capped, and tags are applied only when you click.

## Reporting a problem

Please open a private security advisory on the GitHub repository rather than a public issue.
