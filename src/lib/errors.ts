/** Turns an unknown error (often an IPC rejection) into a short message fit for a toast. */
export function describeError(error: unknown, fallback = 'Something went wrong'): string {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    if (!raw) return fallback;
    const stripped = raw
        .replace(/^Error invoking remote method '[^']+': /, '')
        .replace(/^(Error|TypeError|RangeError): /, '')
        .trim();
    if (/UNIQUE constraint failed/i.test(stripped)) return 'An entry with that name already exists.';
    if (/ENOENT/i.test(stripped)) return 'The file or folder could not be found.';
    if (/EACCES|EPERM/i.test(stripped)) return 'Permission denied.';
    return stripped.split('\n')[0].slice(0, 240) || fallback;
}
