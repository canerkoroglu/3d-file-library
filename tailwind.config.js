/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    bg: '#1a1a1a',
                    card: '#2d2d2d',
                    hover: '#353535',
                },
                accent: {
                    blue: '#3b82f6',
                    gray: '#404040',
                },
                text: {
                    primary: '#ffffff',
                    secondary: '#a0a0a0',
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
