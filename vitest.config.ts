import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'html', 'lcov'],
            include: ['src/**', 'electron/**'],
            // Not meaningfully unit-coverable from Node: type-only files, the React entry,
            // build/scripts, and the UI components (exercised by the e2e suite instead).
            exclude: [
                '**/*.d.ts',
                'src/types/**',
                'src/main.tsx',
                '**/*.config.*',
            ],
            // No enforced thresholds yet — enable reporting first, then ratchet a floor once
            // the gaps are understood (e.g. `thresholds: { lines: 60 }`).
        },
    },
});
