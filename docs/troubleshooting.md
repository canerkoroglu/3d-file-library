# Troubleshooting

Start here when something does not work. If your problem is not listed, the log usually says why:
**Settings → About → Open log folder** and open `main.log`.

## Installing and starting

| Symptom | Cause and fix |
| --- | --- |
| Windows: *"Windows protected your PC"* | The installer is not yet code-signed. Click **More info → Run anyway**. |
| macOS: *"cannot be opened because the developer cannot be verified"* | Unsigned build. Right-click the app → **Open** → **Open**, once. |
| Linux: the AppImage does nothing | Make it executable: `chmod +x MeshVault-*.AppImage`. On Ubuntu 24.04+ you may also need `libfuse2`. |
| The app opens to an error screen | Restart it. If it persists, send the log (see [Reporting a bug](#reporting-a-bug)). |
| My theme setting was reset after updating | The theme is carried over automatically when updating from 1.0.2 or earlier. If it was not, choose it again in Settings → Appearance. |

## Library and files

| Symptom | Cause and fix |
| --- | --- |
| A folder's models are all *Missing* | The folder or drive is not reachable (unplugged, network share offline, renamed). Reconnect it; models are restored within ten seconds. |
| New files do not appear | Network shares and some synced folders do not report changes reliably. Press ↻ next to *Watched folders* to re-scan. |
| A removed model came back | *Remove from library* does not delete the file; a file inside a watched folder is re-imported on the next scan. Delete the file from disk to remove it for good. |
| Measurements are empty | Analysis is still running (see the sidebar), the format has no measurements (STEP, USDZ), or the file could not be read — the log has an `[Indexer]` line explaining why. |
| A file shows *could not be analysed* | It is damaged, unsupported, or took too long. Open it in a slicer to check it; it stays in the library either way. |
| Search does not find something | Check spelling and operators (`tag:` uses tag names). After restoring a backup, run Settings → Library index → **Rebuild search index**. |
| Dropping files does nothing | Only supported model files and `.zip` archives are accepted. |

## Thumbnails and the viewer

| Symptom | Cause and fix |
| --- | --- |
| Generic icons instead of previews | Previews render in the background; wait for the sidebar progress to finish. To redo them: Settings → Library index → **Rebuild search index** with *Also re-render 3D thumbnails*. |
| A preview is wrong or ugly | Open the model, frame it as you like and press **Capture Thumbnail**; captured previews are never overwritten. |
| The viewer is blank or very slow | Update your graphics driver. In virtual machines without GPU acceleration, start MeshVault with `MESHVAULT_SOFTWARE_GL=1`. |
| *Loading model…* never ends on a huge file | Very large meshes (tens of millions of triangles) can exceed GPU memory. Open it in your slicer instead. |
| STEP files take a while the first time | The CAD engine (7.6 MB) loads on first use, then stays ready. |

## Slicers

| Symptom | Cause and fix |
| --- | --- |
| My slicer is not listed | Settings → Slicers → **Rescan**. If it is installed somewhere unusual, **Add slicer…** to pick it by hand. |
| *Open in Slicer* fails | The error under the button says why. Try *System default app*, or re-add the slicer. |

## AI assistant

See the troubleshooting table in [ai-assistant.md](ai-assistant.md#troubleshooting).

## Updates

| Symptom | Cause and fix |
| --- | --- |
| *Check for updates* fails | No internet access to GitHub, or a proxy blocks it. Download the new version from the releases page. |
| macOS shows a link instead of installing | Unsigned macOS builds cannot update themselves; download and replace the app. |

## Resetting

- **Rebuild the index** (keeps tags, collections, notes): Settings → Library index → **Rebuild search index**.
- **Start over completely:** quit MeshVault and rename or delete the library folder
  (see [Where your data lives](user-guide.md#where-your-data-lives)). Your model files are not touched.

## Reporting a bug

Open an issue on GitHub with:

1. What you did, what you expected, and what happened.
2. Your MeshVault version (Settings → About) and operating system.
3. The relevant part of `main.log` (Settings → About → **Open log folder**). It contains file paths;
   remove anything you do not want to share.

Security problems: please follow [SECURITY.md](../SECURITY.md) instead of opening a public issue.
