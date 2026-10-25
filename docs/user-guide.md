# MeshVault user guide

Everything MeshVault can do, in the order you are likely to need it.

- [How MeshVault works](#how-meshvault-works)
- [Adding your models](#adding-your-models)
- [Browsing and searching](#browsing-and-searching)
- [The 3D viewer](#the-3d-viewer)
- [Organising: tags, collections and bulk actions](#organising-tags-collections-and-bulk-actions)
- [Missing files and external drives](#missing-files-and-external-drives)
- [Duplicates](#duplicates)
- [Printer bed check](#printer-bed-check)
- [Slicers](#slicers)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Where your data lives](#where-your-data-lives)
- [FAQ](#faq)

## How MeshVault works

MeshVault never moves, renames or copies your files unless you ask it to (renaming a file, or
extracting a ZIP into a folder you chose). It keeps a **catalogue** — a small database next to the
app's settings — that remembers what is in your folders: names, sizes, measurements, thumbnails,
and everything you add yourself (tags, collections, notes, source links).

Files are analysed in the background. A freshly added folder is usable immediately; measurements,
thumbnails and search text fill in over the next moments. Progress is shown at the bottom of the
sidebar.

**Supported formats**

| Format | Viewer & thumbnail | Measurements | Notes |
| --- | --- | --- | --- |
| STL (binary and ASCII) | ✓ | triangles, size, volume | |
| 3MF | ✓ | triangles, size, volume | Slicer projects also give title, designer, printer, filament, layer height and the embedded preview. Multi-part Bambu / Orca / Prusa projects are supported. |
| OBJ | ✓ | triangles, size, volume | |
| STEP (.step, .stp) | ✓ | — | CAD files are converted to a mesh when opened. |
| GLB / glTF | ✓ | triangles, size | Materials and textures are shown as stored in the file. |
| USDZ | ✓ | — | |

Sizes are in millimetres, the unit slicers use.

## Adding your models

### Watched folders (recommended)

Sidebar → **Watched folders** → **+**, then choose a folder. Every supported file inside it,
including sub-folders, appears in the library, and the folder is kept in sync from then on: new
files appear, changed files are re-analysed, deleted files are flagged as missing.

Files and folders whose names start with a dot are ignored. The ↻ button next to *Watched folders*
re-scans every folder from disk, which is useful after changing many files while the app was closed.

### Drag and drop

- **Model files** dropped on the window are added where they are (no copy is made).
- **ZIP archives** dropped on the window open the **Import ZIP** dialog (see below).

### Importing ZIP downloads

Sidebar → **Import ZIP…**, or drop archives on the window. Choose the watched folder they should go
into and press **Import**. Each archive is extracted into its own sub-folder, so the README, licence
and preview images stay next to the models. A link to the model page found in the README fills in the
model's source site and URL automatically.

For your safety, archives are checked before extraction: entries that try to escape the destination
folder are skipped, and very large archives (over 1 GB, more than 10,000 files, or more than 8 GB once
extracted) are refused.

### Sidecar files

MeshVault looks next to each model for files that downloads usually include — `README`, `LICENSE`,
and preview images (also in the `files/` + `images/` layout used by Thingiverse and Printables). Their
text becomes searchable, licences are detected, and a matching preview image becomes the thumbnail.

## Browsing and searching

The grid shows every model in the current view: *All Models*, a collection, or a watched folder.
Use the sort menu to order by best match, date added, name, file size, detail (triangle count) or
last modification; the toggle on the right switches between grid and list.

### Search

Type words to search names, folders, tags, notes, source details, slicer settings, READMEs and AI
descriptions. Every word must match somewhere. While you search, results are ordered by relevance.

Narrow results with operators, alone or combined:

| Query | Finds |
| --- | --- |
| `benchy hull` | models matching both words |
| `"low poly"` | the exact phrase |
| `tag:printed` | models with the tag (repeat to require several) |
| `type:3mf` | a file type: `stl`, `3mf`, `obj`, `glb`, `usdz`, `step` |
| `source:printables` | source site from the metadata |
| `author:name` | author from the metadata, or the designer stored in a 3MF |
| `license:cc-by` | licence from the metadata or a detected LICENSE/README |
| `tris:>100k`  `tris:<2m` | more / fewer triangles than a number (`k` = thousand, `m` = million) |
| `size:<50`  `size:>200` | largest dimension below / above a number of millimetres |
| `has:readme`  `has:thumbnail` | models with a README beside them / with a preview |
| `is:missing`  `is:available` | files that cannot be found / files that are present |
| `category:kitchen` | category given by the AI assistant |
| `added:>7d`  `added:<2026-01-01` | added within / before a period or date (`d`, `w`, `m`, `y`) |
| `modified:>2w` | file changed within a period |

Example: `dragon type:stl size:<120` finds dragon STLs whose largest side is under 12 cm.
Press **Esc** in the search box to clear it.

### Ask in plain words

With the [AI assistant](ai-assistant.md) set up, press ✨ in the search box and write what you are
looking for — "small printed dragons from last month". MeshVault turns it into a search, shows what
it understood, and you can edit the result.

## The 3D viewer

Click a model card (or press Enter on a focused card) to open it. Models are shown Z-up, the way your
slicer shows them, sitting on a grid.

**Mouse:** drag to orbit, scroll to zoom, right-drag to pan.

**Toolbar (top left):**

| Button | Shortcut | Does |
| --- | --- | --- |
| Auto-rotate | Space | turns the model slowly |
| Wireframe | W | shows the mesh edges |
| Grid | G | shows or hides the floor grid |
| Section view | — | a slider that cuts the model at a height, to look inside |
| Reset view | R | returns the camera to the start |
| Colour | — | picks the colour used for single-colour formats |
| File colours | — | 3MF only: colours stored in the file vs. a single colour |

**Capture Thumbnail** (top right) saves the current view as the model's thumbnail. Captured
thumbnails are never replaced automatically.

**Side panel:**

- **File** — click the name to rename the file on disk (Enter to confirm, Esc to cancel).
- **Geometry** — size, triangles, volume, and a warning if the model is larger than your printer.
- **Project** — slicer settings read from 3MF project files.
- **Source** — site, author, licence, URL and your notes; **Edit** to change them.
- **AI** — description, category, keywords and suggested tags (see the AI assistant).
- **Similar models** — when the semantic index has been built.
- **README** — the README found next to the file.
- **Collections** and **Tags** — tick to add or remove; **+ New Tag** creates one.
- **Open in Slicer** — opens the file in your default slicer; the arrow next to it lets you pick another.
- **Show in Folder** — reveals the file in Finder / Explorer.

Press **Esc** to close the viewer.

## Organising: tags, collections and bulk actions

- **Tags** are coloured labels (a set such as *Printed*, *Draft* and *Print Next* is created for you).
  Filter by tags with the chips under the search box, or with `tag:` in a search.
- **Collections** group models regardless of where the files live; a model can be in any number of
  collections. Create one with **+** next to *Collections*; double-click to rename.

**Selecting several models:** hover a card and tick its checkbox, **⌘/Ctrl-click** to toggle cards,
**Shift-click** to select a range, **⌘/Ctrl+A** to select everything loaded, **Esc** to clear.
The action bar at the bottom then lets you add or remove a tag, add to a collection, ask the AI to
analyse them, or remove them from the library. Removing deletes the catalogue entries (tags, notes,
thumbnail), never the files on disk; a file that is still inside a watched folder comes back on the
next re-scan.

## Missing files and external drives

When a file cannot be found it is marked **Missing**: its card is dimmed, it sorts to the end, and it is
left out of duplicate checks. Its tags, collections and notes are kept. When the file returns — for
example when you plug a drive back in — it is restored automatically. Folders are checked every
ten seconds.

To clean up for good: **Settings → Missing files → Forget missing files**, or search `is:missing` to
review them first.

## Duplicates

Sidebar → **Find Duplicates** lists:

- **Exact duplicates** — files with identical content, with the space you would save.
- **Near-duplicates** — different files with the same geometry (same triangle count and size), such as
  the same model exported twice.

Removing a duplicate from this list removes it from the library, not from disk. Delete the file itself
from your folder if you no longer want it; otherwise a watched folder brings it back on the next re-scan.

## Printer bed check

**Settings → Printer bed size**: enter your printer's build volume in millimetres. Any model that does
not fit in any orientation is marked **Exceeds bed** on its card and in the viewer.

## Slicers

MeshVault looks for installed slicers — Bambu Studio, OrcaSlicer, PrusaSlicer, SuperSlicer, UltiMaker
Cura, ideaMaker, Lychee, CHITUBOX, Creality Print, ELEGOO, QIDI, Anycubic, FlashPrint and Snapmaker
Luban — on Windows, macOS and Linux. In **Settings → Slicers** choose the default, **Rescan** after
installing one, or **Add slicer…** for any other program. *System default app* opens the file with whatever your
system associates with it.

## Settings

| Section | What it does |
| --- | --- |
| Appearance | Light, dark or system theme. |
| Library index | **Rebuild search index** re-analyses every file, optionally re-rendering 3D thumbnails (captured and embedded previews are kept). |
| AI assistant | Connect a language model — see [AI assistant](ai-assistant.md). |
| Printer bed size | Build volume for the fit check. |
| Slicers | Default slicer, rescan, custom slicers. |
| Missing files | How many files are missing; forget them. |
| About | Version, updates (check, download, install, automatic checks), source code link, **Open log folder**. |

## Keyboard shortcuts

| Where | Key | Action |
| --- | --- | --- |
| Library | ⌘/Ctrl + A | select all loaded models |
| Library | Esc | clear the selection |
| Library | ⌘/Ctrl-click, Shift-click | toggle a card, select a range |
| Search box | Esc | clear the search |
| Model card | Enter / Space | open the model (or toggle it while selecting) |
| Viewer | Space | auto-rotate on/off |
| Viewer | W | wireframe |
| Viewer | G | grid |
| Viewer | R | reset view |
| Viewer | Esc | close |

## Where your data lives

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Library folder | `%APPDATA%\MeshVault` | `~/Library/Application Support/MeshVault` | `~/.config/MeshVault` |

Inside it: `modelist.db` (the catalogue; the name predates the rename), `thumbnails/`, and
`logs/main.log`. If you used MeshVault while it was still called Modelist, the library stays in the
old `Modelist` folder and keeps being used.

**Backing up:** quit MeshVault and copy the library folder. Your model files themselves are wherever
you keep them; MeshVault does not hold copies.

**Starting fresh:** quit MeshVault and delete (or rename) the library folder. Your model files are not
affected.

## FAQ

**Does MeshVault change my files?** Only when you rename a file from the viewer, or extract a ZIP into a
folder. Everything else — tags, notes, collections, thumbnails — is stored in the catalogue.

**Does it upload anything?** No. The only network traffic is the update check (GitHub releases) and,
if you set it up, the AI server you configured.

**Can I use it on several computers?** Each installation has its own catalogue. Watching the same synced
folder (Dropbox, OneDrive, a NAS) from several computers works; tags and collections are per computer.

**A model shows a folder icon or a generic preview.** Its 3D thumbnail has not been rendered yet, or
rendering failed. Open it and use **Capture Thumbnail**, or see [Troubleshooting](troubleshooting.md).
