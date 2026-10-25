# Releasing

How a version goes from `main` to users' computers.

## Versioning

MeshVault follows [Semantic Versioning](https://semver.org): **major** for changes that need users to do
something (e.g. a library format they cannot downgrade from), **minor** for new features, **patch** for
fixes. Record every user-visible change under *Unreleased* in [CHANGELOG.md](../CHANGELOG.md) as you
go.

## Release checklist

1. `main` is green in CI (typecheck, lint, unit tests, audit, end-to-end on all three systems).
2. Move the *Unreleased* entries in `CHANGELOG.md` under the new version and date.
3. Bump the version and tag it:

   ```bash
   npm version minor        # or patch / major — updates package.json and creates tag vX.Y.Z
   git push --follow-tags
   ```

4. The **Release** workflow builds the installers on macOS, Windows and Linux, signs them if the
   signing secrets are configured ([code-signing.md](code-signing.md)), and uploads everything —
   installers, `latest*.yml` update manifests and blockmaps — to a **draft** GitHub release.
5. Download and smoke-test the installers: install over the previous version, check that the library
   is intact, open a few models, run a search.
6. Paste the changelog entry into the release notes and **publish** the draft.

Installed copies find the new version within six hours (or immediately via Settings → About →
**Check for updates**), download it on request and install it on restart.

## What the workflows do

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `ci.yml` | every push to `main`, every pull request | checks + audit → end-to-end on macOS/Windows/Linux → unsigned installers as build artifacts |
| `release.yml` | a `v*` tag | build per OS (no publishing, so one failing platform cannot break the release) → one job creates the draft release and uploads all files |

## Auto-update details

- Updates come from GitHub releases through `electron-updater`. The download is checked against the
  SHA-512 in the release manifest.
- **macOS** can only update itself when the app is signed and notarised; unsigned builds show a banner
  linking to the release page instead.
- **Windows** NSIS installs update in place. The portable `.exe` does not self-update.
- **Linux** AppImages update in place when the AppImage file is writable.
- The app id (`com.modelist.stlviewer`) must never change: it is how installers and the updater
  recognise an existing installation (it dates from the Modelist name).

## Building installers locally

```bash
npm run build:win     # on Windows
npm run build:mac     # on macOS
npm run build:linux   # on Linux
```

Output goes to `release/`. Build each platform on its own operating system; cross-building Windows
installers on Linux works but needs Wine and the Windows variants of the native packages
(`npm install --os=win32 --cpu=x64`).

The build applies the Electron fuses from `electron-builder.config.cjs` (see
[security.md](security.md)); a locally built app therefore ignores `--inspect` and `NODE_OPTIONS`, as
the released one does.
