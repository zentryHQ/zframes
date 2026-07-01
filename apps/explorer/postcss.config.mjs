// Tailwind v4 in Next runs through the PostCSS plugin (the runtime uses the
// Vite plugin instead — same Tailwind core, different host adapter).
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
