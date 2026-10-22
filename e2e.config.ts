import type { E2EConfig } from "e2e";

export default {
  tests: "tests/**/*.e2e.ts",
  workers: 1,
  targets: [{ name: "relay", platform: "web" }],
} satisfies E2EConfig;
