/**
 * electron-builder configuration.
 *
 * Code signing switches on by itself when the matching credentials are present in the
 * environment (see docs/code-signing.md); without them the installers are built unsigned.
 *   macOS:   CSC_LINK + CSC_KEY_PASSWORD (Developer ID certificate), notarised when
 *            APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID (or an App Store Connect API key) are set.
 *   Windows: WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (a .pfx certificate), or Azure Trusted Signing when
 *            AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET and the AZURE_TRUSTED_SIGNING_* settings are set.
 */

/** Azure Trusted Signing settings, only when every value is available. */
function azureSignOptions() {
    const options = {
        endpoint: process.env.AZURE_TRUSTED_SIGNING_ENDPOINT,
        codeSigningAccountName: process.env.AZURE_TRUSTED_SIGNING_ACCOUNT,
        certificateProfileName: process.env.AZURE_TRUSTED_SIGNING_PROFILE,
        publisherName: process.env.WIN_PUBLISHER_NAME,
    };
    const credentials = process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET;
    return credentials && Object.values(options).every(Boolean) ? options : null;
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
    // Kept from before the rename so existing installs upgrade in place (installer identity and auto-update).
    appId: 'com.modelist.stlviewer',
    productName: 'MeshVault',
    files: [
        'dist/**/*',
        'dist-electron/**/*',
        // better-sqlite3 ships its C sources for building from source; the prebuilt binaries are all the app needs.
        '!node_modules/better-sqlite3/{deps,src}/**',
        '!node_modules/better-sqlite3/binding.gyp',
    ],
    mac: {
        target: ['dmg', 'zip'],
        category: 'public.app-category.productivity',
        icon: 'icons/icon.icns',
    },
    win: {
        target: ['nsis', 'portable'],
        icon: 'icons/icon.ico',
        azureSignOptions: azureSignOptions(),
    },
    linux: {
        target: 'AppImage',
        icon: 'icons/icon.png',
        category: 'Graphics',
    },
    // Native code must live outside the asar archive. sharp's libvips libraries (e.g. libvips-cpp.so.8.x
    // on Linux) are not matched by *.node, so its platform packages are unpacked as a whole.
    asarUnpack: ['**/*.node', '**/node_modules/@img/**'],
    // The native modules (better-sqlite3, sharp) ship prebuilt Node-API binaries that work in Electron
    // unchanged, so nothing has to be compiled (no C++ toolchain needed to build the installers).
    npmRebuild: false,
    directories: { output: 'release' },
    publish: {
        provider: 'github',
        owner: 'canerkoroglu',
        repo: '3d-file-library',
        releaseType: 'draft',
    },
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    // Electron fuses are switches compiled into the shipped binary (see docs/security.md).
    electronFuses: {
        runAsNode: false, // ELECTRON_RUN_AS_NODE cannot turn the app into a plain Node.js runtime
        enableNodeOptionsEnvironmentVariable: false, // NODE_OPTIONS cannot inject code or flags
        enableNodeCliInspectArguments: false, // --inspect cannot attach a debugger to the main process
        enableCookieEncryption: true,
        enableEmbeddedAsarIntegrityValidation: true, // macOS/Windows refuse a modified app.asar
        onlyLoadAppFromAsar: true, // …and only the validated app.asar is ever loaded
        grantFileProtocolExtraPrivileges: false, // the UI is served from app://, not file://
    },
};
