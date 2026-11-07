import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works from any folder or sub-path (GitHub Pages, itch.io).
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
