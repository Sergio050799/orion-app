/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        orion: {
          // Brand identity — intocable
          accent: "#3CE0FF",
          // Backgrounds
          deep:    "#020617",
          navy:    "#040d1a",
          void:    "#00030a",
          // Violet tint for gradients (CosmosCore heritage)
          violet:  "#0d1b3e",
          // Semantic
          success: "#10B981",
          danger:  "#EF4444",
          warning: "#F59E0B",
          // Text
          text:    "#F1F5F9",
          muted:   "#64748B",
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'orion-bg': 'radial-gradient(ellipse at 50% 0%, #0d1b3e 0%, #020617 55%, #00030a 100%)',
      },
      animation: {
        'fade-in':        'fadeIn 0.4s ease-out forwards',
        'slide-up':       'slideUp 0.4s ease-out forwards',
        'slide-in-right': 'slideInRight 0.3s ease-out forwards',
        'glow-pulse':     'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%':      { opacity: '0.8' },
        },
      },
      boxShadow: {
        'accent-glow': '0 0 20px rgba(60, 224, 255, 0.15)',
        'accent-glow-lg': '0 0 40px rgba(60, 224, 255, 0.2)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4)',
        'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.5)',
      },
    },
  },
  plugins: [],
};
