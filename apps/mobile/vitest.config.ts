import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'modules/**/*.test.ts'], setupFiles: ['./vitest.setup.ts'] }
});
