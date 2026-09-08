/**
 * Slicer discovery and launching. Known slicers are looked up in the usual install
 * locations for each platform; the user can register others and pick a default.
 */
import { BrowserWindow, dialog, shell } from 'electron';
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSetting, setSetting } from './settings';
import type { Slicer } from '../src/types';

export const SYSTEM_SLICER_ID = 'system';
const SETTING_DEFAULT = 'slicers.default';
const SETTING_CUSTOM = 'slicers.custom';
const CACHE_TTL_MS = 60_000;

interface KnownSlicer {
    id: string;
    name: string;
    /** macOS: app bundle name inside /Applications or ~/Applications. */
    mac: RegExp;
    /** Windows: install folder name and executable name (searched two levels deep). */
    win: { dir: RegExp; exe: RegExp };
    /** Linux: binaries on PATH, flatpak app id, AppImage file name. */
    linux: { bins: string[]; flatpak?: string; appimage?: RegExp };
}

const KNOWN: KnownSlicer[] = [
    { id: 'bambu', name: 'Bambu Studio', mac: /^bambu ?studio\.app$/i, win: { dir: /^bambu ?studio$/i, exe: /^bambu-studio\.exe$/i }, linux: { bins: ['bambu-studio', 'BambuStudio'], flatpak: 'com.bambulab.BambuStudio', appimage: /bambu/i } },
    { id: 'orca', name: 'OrcaSlicer', mac: /^orcaslicer\.app$/i, win: { dir: /^orcaslicer$/i, exe: /^orca-slicer\.exe$/i }, linux: { bins: ['orca-slicer', 'OrcaSlicer'], flatpak: 'io.github.softfever.OrcaSlicer', appimage: /orca/i } },
    { id: 'prusa', name: 'PrusaSlicer', mac: /^prusaslicer.*\.app$/i, win: { dir: /^(prusa3d|prusaslicer.*)$/i, exe: /^prusa-slicer\.exe$/i }, linux: { bins: ['prusa-slicer', 'PrusaSlicer'], flatpak: 'com.prusa3d.PrusaSlicer', appimage: /prusa/i } },
    { id: 'superslicer', name: 'SuperSlicer', mac: /^superslicer\.app$/i, win: { dir: /^superslicer/i, exe: /^superslicer\.exe$/i }, linux: { bins: ['superslicer', 'SuperSlicer'], appimage: /superslicer/i } },
    { id: 'cura', name: 'UltiMaker Cura', mac: /^(ultimaker[ -]?)?cura\.app$/i, win: { dir: /^ulti?maker[ -]?cura/i, exe: /^ulti?maker-cura\.exe$/i }, linux: { bins: ['cura', 'UltiMaker-Cura'], flatpak: 'com.ultimaker.cura', appimage: /cura/i } },
    { id: 'ideamaker', name: 'ideaMaker', mac: /^ideamaker\.app$/i, win: { dir: /^raise3d$/i, exe: /^ideamaker\.exe$/i }, linux: { bins: ['ideamaker'] } },
    { id: 'lychee', name: 'Lychee Slicer', mac: /^lychee ?slicer\.app$/i, win: { dir: /^lychee ?slicer/i, exe: /^lychee ?slicer\.exe$/i }, linux: { bins: [], appimage: /lychee/i } },
    { id: 'chitubox', name: 'CHITUBOX', mac: /^chitubox.*\.app$/i, win: { dir: /^chitubox/i, exe: /^chitubox.*\.exe$/i }, linux: { bins: [], appimage: /chitubox/i } },
    { id: 'creality', name: 'Creality Print', mac: /^creality ?print\.app$/i, win: { dir: /^creality/i, exe: /^creality ?print\.exe$/i }, linux: { bins: [], appimage: /creality/i } },
    { id: 'elegoo', name: 'ELEGOO Slicer', mac: /^elegoo ?slicer\.app$/i, win: { dir: /^elegoo ?slicer/i, exe: /^elegoo-?slicer\.exe$/i }, linux: { bins: [], appimage: /elegoo/i } },
    { id: 'qidi', name: 'QIDISlicer', mac: /^qidislicer\.app$/i, win: { dir: /^qidi/i, exe: /^qidi-slicer\.exe$/i }, linux: { bins: ['qidi-slicer'], appimage: /qidi/i } },
    { id: 'anycubic', name: 'Anycubic Slicer', mac: /^anycubic ?slicer.*\.app$/i, win: { dir: /^anycubic ?slicer/i, exe: /^anycubic.*\.exe$/i }, linux: { bins: [], appimage: /anycubic/i } },
    { id: 'flashprint', name: 'FlashPrint', mac: /^flashprint.*\.app$/i, win: { dir: /^flashprint/i, exe: /^flashprint\.exe$/i }, linux: { bins: [], appimage: /flashprint/i } },
    { id: 'luban', name: 'Snapmaker Luban', mac: /^snapmaker ?luban\.app$/i, win: { dir: /^snapmaker ?luban/i, exe: /^snapmaker ?luban\.exe$/i }, linux: { bins: [], appimage: /luban/i } },
];

interface CustomSlicer {
    id: string;
    name: string;
    path: string;
}

interface Detected {
    id: string;
    name: string;
    path: string;
    /** How to launch it. */
    launch: 'mac-app' | 'exe' | 'bin' | 'flatpak';
}

let cache: { at: number; detected: Detected[] } | null = null;

async function readDir(dir: string): Promise<fs.Dirent[]> {
    try {
        return await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

async function exists(p: string): Promise<boolean> {
    try {
        await fs.promises.access(p);
        return true;
    } catch {
        return false;
    }
}

function run(command: string, args: string[]): Promise<string> {
    return new Promise((resolve) => {
        execFile(command, args, { timeout: 5000 }, (error, stdout) => resolve(error ? '' : String(stdout)));
    });
}

async function detectMac(): Promise<Detected[]> {
    const found: Detected[] = [];
    for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) {
        for (const entry of await readDir(dir)) {
            if (!entry.name.toLowerCase().endsWith('.app')) continue;
            const known = KNOWN.find((k) => k.mac.test(entry.name));
            if (known && !found.some((f) => f.id === known.id)) {
                found.push({ id: known.id, name: known.name, path: path.join(dir, entry.name), launch: 'mac-app' });
            }
        }
    }
    return found;
}

/** Looks for an executable matching `exe` up to two directory levels below `dir`. */
async function findExe(dir: string, exe: RegExp, depth = 2): Promise<string | null> {
    for (const entry of await readDir(dir)) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && exe.test(entry.name)) return full;
        if (entry.isDirectory() && depth > 0) {
            const nested = await findExe(full, exe, depth - 1);
            if (nested) return nested;
        }
    }
    return null;
}

async function detectWindows(): Promise<Detected[]> {
    const found: Detected[] = [];
    const bases = [
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : undefined,
        process.env.LOCALAPPDATA,
    ].filter((p): p is string => Boolean(p));

    for (const base of bases) {
        for (const entry of await readDir(base)) {
            if (!entry.isDirectory()) continue;
            const known = KNOWN.find((k) => k.win.dir.test(entry.name));
            if (!known || found.some((f) => f.id === known.id)) continue;
            const exe = await findExe(path.join(base, entry.name), known.win.exe);
            if (exe) found.push({ id: known.id, name: known.name, path: exe, launch: 'exe' });
        }
    }
    return found;
}

async function detectLinux(): Promise<Detected[]> {
    const found: Detected[] = [];
    const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean);

    for (const known of KNOWN) {
        for (const bin of known.linux.bins) {
            for (const dir of pathDirs) {
                const full = path.join(dir, bin);
                if (await exists(full)) {
                    found.push({ id: known.id, name: known.name, path: full, launch: 'bin' });
                    break;
                }
            }
            if (found.some((f) => f.id === known.id)) break;
        }
    }

    const flatpaks = (await run('flatpak', ['list', '--app', '--columns=application'])).split('\n').map((l) => l.trim());
    for (const known of KNOWN) {
        if (known.linux.flatpak && flatpaks.includes(known.linux.flatpak) && !found.some((f) => f.id === known.id)) {
            found.push({ id: known.id, name: `${known.name} (Flatpak)`, path: known.linux.flatpak, launch: 'flatpak' });
        }
    }

    for (const dir of [path.join(os.homedir(), 'Applications'), path.join(os.homedir(), '.local', 'bin'), '/opt']) {
        for (const entry of await readDir(dir)) {
            if (!/\.appimage$/i.test(entry.name)) continue;
            const known = KNOWN.find((k) => k.linux.appimage?.test(entry.name));
            if (known && !found.some((f) => f.id === known.id)) {
                found.push({ id: known.id, name: `${known.name} (AppImage)`, path: path.join(dir, entry.name), launch: 'bin' });
            }
        }
    }
    return found;
}

async function detect(rescan: boolean): Promise<Detected[]> {
    if (!rescan && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.detected;
    const detected = process.platform === 'darwin' ? await detectMac()
        : process.platform === 'win32' ? await detectWindows()
        : await detectLinux();
    cache = { at: Date.now(), detected };
    return detected;
}

function customSlicers(): CustomSlicer[] {
    return getSetting<CustomSlicer[]>(SETTING_CUSTOM, []);
}

function launchModeFor(filePath: string): Detected['launch'] {
    if (process.platform === 'darwin' && filePath.toLowerCase().endsWith('.app')) return 'mac-app';
    if (process.platform === 'win32') return 'exe';
    return 'bin';
}

export async function listSlicers(rescan = false): Promise<Slicer[]> {
    const detected = await detect(rescan);
    const defaultId = getSetting<string | null>(SETTING_DEFAULT, null);
    const custom = customSlicers();

    const all: Slicer[] = [
        ...detected.map((d) => ({ id: d.id, name: d.name, path: d.path, detected: true, isCustom: false, isDefault: false })),
        ...custom.map((c) => ({ id: c.id, name: c.name, path: c.path, detected: false, isCustom: true, isDefault: false })),
        { id: SYSTEM_SLICER_ID, name: 'System default app', path: '', detected: true, isCustom: false, isDefault: false },
    ];

    // The stored default wins; otherwise the first detected slicer, otherwise the system handler.
    const effectiveDefault = all.find((s) => s.id === defaultId) ?? all[0];
    return all.map((s) => ({ ...s, isDefault: s.id === effectiveDefault.id }));
}

export function setDefaultSlicer(id: string | null): void {
    setSetting(SETTING_DEFAULT, id);
}

export async function addCustomSlicer(win: BrowserWindow | undefined): Promise<Slicer | null> {
    const filters = process.platform === 'darwin'
        ? [{ name: 'Applications', extensions: ['app'] }]
        : process.platform === 'win32'
            ? [{ name: 'Programs', extensions: ['exe'] }]
            : [{ name: 'All files', extensions: ['*'] }];
    const result = await dialog.showOpenDialog(win!, {
        title: 'Choose a slicer application',
        properties: ['openFile'],
        filters,
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const name = path.basename(filePath).replace(/\.(app|exe|appimage)$/i, '');
    const entry: CustomSlicer = { id: `custom:${Date.now()}`, name, path: filePath };
    setSetting(SETTING_CUSTOM, [...customSlicers(), entry]);
    return { id: entry.id, name: entry.name, path: entry.path, detected: false, isCustom: true, isDefault: false };
}

export function removeCustomSlicer(id: string): void {
    setSetting(SETTING_CUSTOM, customSlicers().filter((c) => c.id !== id));
    if (getSetting<string | null>(SETTING_DEFAULT, null) === id) setSetting(SETTING_DEFAULT, null);
}

function spawnDetached(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const child = spawn(command, args, { detached: true, stdio: 'ignore' });
            child.once('error', reject);
            child.once('spawn', () => {
                child.unref();
                resolve();
            });
        } catch (error) {
            reject(error);
        }
    });
}

export async function openInSlicer(filePath: string, slicerId?: string): Promise<void> {
    const slicers = await listSlicers();
    const target = slicers.find((s) => s.id === (slicerId ?? slicers.find((x) => x.isDefault)?.id));
    if (!target || target.id === SYSTEM_SLICER_ID) {
        const error = await shell.openPath(filePath);
        if (error) throw new Error(error);
        return;
    }

    const detected = (await detect(false)).find((d) => d.id === target.id);
    const launch = detected?.launch ?? launchModeFor(target.path);

    switch (launch) {
        case 'mac-app': {
            const error = await new Promise<string>((resolve) =>
                execFile('open', ['-a', target.path, filePath], (err, _stdout, stderr) => resolve(err ? String(stderr || err.message) : '')),
            );
            if (error) throw new Error(`Could not open ${target.name}: ${error.trim()}`);
            return;
        }
        case 'flatpak':
            await spawnDetached('flatpak', ['run', target.path, filePath]);
            return;
        case 'exe':
        case 'bin':
            await spawnDetached(target.path, [filePath]);
            return;
    }
}
