import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanDirectory } from '../electron/folderScan';

describe('scanDirectory', () => {
    let tmp: string;
    let root: string;

    beforeEach(() => {
        tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meshvault-scan-')));
        root = path.join(tmp, 'library');
        fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.stl'), 'solid a');
        fs.writeFileSync(path.join(root, 'notes.txt'), 'not a model');
        fs.writeFileSync(path.join(root, 'sub', 'b.obj'), 'v 0 0 0');
        fs.mkdirSync(path.join(root, '.hidden'));
        fs.writeFileSync(path.join(root, '.hidden', 'c.stl'), 'solid c');
        // Outside the library, reached only through links.
        fs.mkdirSync(path.join(tmp, 'outside'));
        fs.writeFileSync(path.join(tmp, 'outside', 'd.3mf'), 'zip');
        fs.writeFileSync(path.join(tmp, 'e.glb'), 'glb');
    });

    afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

    it('follows symlinked folders and files, skipping loops and broken links', async () => {
        const dirType = process.platform === 'win32' ? 'junction' : 'dir';
        fs.symlinkSync(path.join(tmp, 'outside'), path.join(root, 'linked'), dirType);
        fs.symlinkSync(path.join(tmp, 'e.glb'), path.join(root, 'e-link.glb'));
        fs.symlinkSync(root, path.join(root, 'sub', 'loop'), dirType); // back to the root
        fs.symlinkSync(path.join(tmp, 'gone.stl'), path.join(root, 'broken.stl'));

        const found = (await scanDirectory(root)).map((p) => path.relative(root, p)).sort();
        expect(found).toEqual(['a.stl', 'e-link.glb', path.join('linked', 'd.3mf'), path.join('sub', 'b.obj')].sort());
    });
});
