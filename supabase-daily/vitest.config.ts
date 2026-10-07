import { defineConfig } from 'vitest/config';

// Own config, so vitest doesn't fall back to the repo root's (which targets tests/**).
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
