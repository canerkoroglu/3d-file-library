# Security policy

## Supported versions

Security fixes are released for the latest version of MeshVault. Installed copies update themselves
(Settings → About), so please make sure you are up to date before reporting.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Report it privately through GitHub: go to the repository's **Security** tab →
**Report a vulnerability** (a private security advisory). Include:

- what an attacker can do, and under which conditions (for example "a crafted 3MF file in a watched
  folder can …");
- steps or a file to reproduce it;
- the MeshVault version and operating system.

You will get an acknowledgement within a few days and a plan for a fix after the report has been
assessed. Once a fix is released, the advisory is published with credit to you, unless you prefer
otherwise.

## Scope

In scope: the desktop app and its installers, the update mechanism, and the files in this repository.
Out of scope: third-party AI servers you connect to, and the security of the computer MeshVault runs on.

How MeshVault is designed to stay safe — sandboxing, file-access rules, Electron fuses, code signing —
is described in [docs/security.md](docs/security.md).
