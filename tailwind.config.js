/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            animation: {
                'fade-in-up': 'fadeInUp 0.8s ease-out forwards',
                'card-enter': 'cardEnter 0.4s ease-out both',
                'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
                'signal-blink': 'signalBlink 2s ease-in-out infinite',
                'beacon-1': 'beaconPulse 3s ease-out infinite',
                'beacon-2': 'beaconPulse 3s ease-out 1.5s infinite',
            },
            keyframes: {
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                cardEnter: {
                    '0%': { opacity: '0', transform: 'translateY(12px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                pulseSubtle: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.6' },
                },
                signalBlink: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.3' },
                },
                beaconPulse: {
                    '0%': { transform: 'scale(1)', opacity: '0.5' },
                    '100%': { transform: 'scale(2.2)', opacity: '0' },
                },
            },
        },
    },
    plugins: [],
}
