# Code signing

Release builds (the `Release` workflow, run on `v*` tags) sign the installers automatically
once the credentials below are stored in the GitHub repository. Each platform is independent:
a platform without credentials is built unsigned, exactly as before, so you can set them up one
at a time. Branch builds in the `CI` workflow are never signed.

Why sign:

- **Windows**: unsigned installers trigger SmartScreen ("Windows protected your PC").
- **macOS**: unsigned apps are blocked by Gatekeeper on first launch and **cannot update themselves**;
  signed and notarised builds update in place.

Store **secrets** under *Settings → Secrets and variables → Actions → Secrets*, and **variables**
under the *Variables* tab of the same page.

## macOS: Developer ID + notarisation

Requires an Apple Developer Program membership.

1. In Xcode or the developer portal, create a **Developer ID Application** certificate and export it
   from Keychain Access as a `.p12` file with a password.
2. Create an app-specific password for your Apple ID at appleid.apple.com.
3. Add these secrets:

| Secret | Value |
| --- | --- |
| `MAC_CERTIFICATE` | the `.p12` file, base64-encoded (`base64 -i cert.p12 \| pbcopy`) |
| `MAC_CERTIFICATE_PASSWORD` | the `.p12` export password |
| `APPLE_ID` | your Apple ID e-mail |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | your 10-character team ID |

With the certificate alone the app is signed; with the three `APPLE_*` secrets as well it is also
notarised, which Gatekeeper requires for apps downloaded from the internet.

## Windows: pick one option

### Option A: Azure Trusted Signing (recommended)

Microsoft's managed signing service; no hardware token, billed monthly, and builds reputation with
SmartScreen. Requires an Azure subscription and identity validation of you or your company.

1. Create a *Trusted Signing account* and a *certificate profile* in the Azure portal.
2. Create an app registration (service principal) and give it the
   *Trusted Signing Certificate Profile Signer* role on the account.
3. Add these **secrets**: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
4. Add these **variables**:

| Variable | Example |
| --- | --- |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | `https://weu.codesigning.azure.net/` (your account's region) |
| `AZURE_TRUSTED_SIGNING_ACCOUNT` | the Trusted Signing account name |
| `AZURE_TRUSTED_SIGNING_PROFILE` | the certificate profile name |
| `WIN_PUBLISHER_NAME` | the subject name on the certificate, e.g. `Caner Köroğlu` |

Azure signing turns on only when all seven values are present.

### Option B: a code-signing certificate file

If your certificate authority gives you an exportable `.pfx` (many now issue certificates only on
hardware tokens or cloud HSMs, which this option does not cover):

| Secret | Value |
| --- | --- |
| `WIN_CERTIFICATE` | the `.pfx` file, base64-encoded (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))`) |
| `WIN_CERTIFICATE_PASSWORD` | the `.pfx` password |

## Signing locally

`npm run build:win` / `npm run build:mac` use the same configuration (`electron-builder.config.cjs`):
set the same environment variables in your shell (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` for a `.pfx`,
`CSC_LINK`/`CSC_KEY_PASSWORD` for the macOS certificate, plus the `APPLE_*` or `AZURE_*` values).
On a Mac with the Developer ID certificate in the keychain, signing works without any variables.

## Checking a build

- Windows: right-click the installer → *Properties* → *Digital Signatures*, or
  `Get-AuthenticodeSignature .\MeshVault-*.exe` in PowerShell.
- macOS: `codesign --verify --deep --strict -v MeshVault.app` and
  `spctl --assess --type execute -v MeshVault.app` (should say *Notarized Developer ID*).
