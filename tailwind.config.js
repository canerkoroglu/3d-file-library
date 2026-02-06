/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: {
                    bg: 'var(--color-primary-bg)',
                    card: 'var(--color-primary-card)',
                    hover: 'var(--color-primary-hover)',
                },
                accent: {
                    blue: 'var(--color-accent-blue)',
                    gray: 'var(--color-accent-gray)',
                    hover: 'var(--color-accent-hover)',
                },
                text: {
                    primary: 'var(--color-text-primary)',
                    secondary: 'var(--color-text-secondary)',
                    inverse: 'var(--color-text-inverse)',
                },
                tag: {
                    draft: '#fbbf24',
                    final: '#60a5fa',
                    multicolor: '#a78bfa',
                    printnext: '#fb923c',
                    printed: '#4ade80',
                    prototype: '#f472b6',
                    urgent: '#f87171',
                }
            },
        },
    },
    plugins: [],
}
