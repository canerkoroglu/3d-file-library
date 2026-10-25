# Contributing to MeshVault

Thanks for helping. This page explains how to propose a change so it can be merged quickly.

## Before you start

- **Bugs:** open an issue with steps to reproduce, your version and OS, and the relevant part of
  `main.log` (see [Troubleshooting](docs/troubleshooting.md#reporting-a-bug)).
- **Features:** open an issue describing the problem you want to solve before writing a large change,
  so we can agree on the approach.
- **Security issues:** do not open a public issue; see [SECURITY.md](SECURITY.md).

## Making a change

1. Fork and clone, then `npm install` and `npm run dev` — see [Development](docs/development.md).
2. Create a branch from `main`.
3. Keep the change focused; unrelated clean-ups belong in their own pull request.
4. Add or update tests:
   - logic in `electron/` or `src/lib/` → a unit test in `tests/`;
   - a user-visible flow → a scenario in `scripts/e2e/scenarios.mjs`;
   - a schema change → a migration and a case in `tests/database.test.ts`.
5. Update the docs that describe what you changed (user guide, architecture, README) and add a line
   under *Unreleased* in [CHANGELOG.md](CHANGELOG.md).
6. Run the full check:

   ```bash
   npm run typecheck && npm run lint && npm test && npm run e2e
   ```

7. Open a pull request explaining **what** changed and **why**, with screenshots for UI changes.

## Guidelines

- Follow the [conventions](docs/development.md#conventions). The most important:
  the renderer is untrusted — validate IPC arguments and never accept a file path from it unless the
  user chose it ([security model](docs/security.md)).
- Never edit a released database migration; add a new one.
- Keep user-facing text short, plain and in sentence case.
- Commit messages: an imperative summary (`Viewer: add section view`), and a body explaining the reason
  when it is not obvious.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
