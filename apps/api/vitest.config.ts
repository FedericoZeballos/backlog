import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    env: { DATABASE_URL: 'postgresql://backlog:backlog@localhost:5434/backlog_test' },
    // All files share one database and reset it between tests.
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
