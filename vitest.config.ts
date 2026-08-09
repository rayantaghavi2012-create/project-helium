import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    // Test files share one live database with no per-test isolation (no
    // transactional rollback, no per-run schema). Running files in parallel
    // lets them race each other over shared rows (e.g. the seeded "test-rookie"
    // character template) — run them sequentially instead.
    fileParallelism: false,
  },
});
