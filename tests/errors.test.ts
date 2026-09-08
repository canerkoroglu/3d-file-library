import { describe, expect, it } from 'vitest';
import { describeError } from '../src/lib/errors';

describe('describeError', () => {
    it('strips the IPC wrapper and error class prefixes', () => {
        expect(describeError(new Error("Error invoking remote method 'rename-model-file': Error: A file with that name already exists")))
            .toBe('A file with that name already exists');
    });

    it('translates common low-level failures', () => {
        expect(describeError(new Error('UNIQUE constraint failed: tags.name'))).toBe('An entry with that name already exists.');
        expect(describeError(new Error("ENOENT: no such file or directory, open '/x'"))).toBe('The file or folder could not be found.');
        expect(describeError(new Error('EACCES: permission denied'))).toBe('Permission denied.');
    });

    it('falls back for empty or unknown values', () => {
        expect(describeError(undefined)).toBe('Something went wrong');
        expect(describeError('', 'Custom fallback')).toBe('Custom fallback');
        expect(describeError('plain text')).toBe('plain text');
    });

    it('keeps only the first line and caps the length', () => {
        expect(describeError(new Error('first line\nsecond line'))).toBe('first line');
        expect(describeError(new Error('x'.repeat(500))).length).toBe(240);
    });
});
