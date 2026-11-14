import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    // The smoke tier boots the real production build (`node dist/main.js`) in a
    // child process; kept apart from the unit (`*.spec.ts`) and e2e
    // (`*.e2e-spec.ts`) tiers, which never spawn processes.
    include: ['**/*.smoke-spec.ts'],
  },
});
