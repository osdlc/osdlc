---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness gen-official-bundle-catalog.ts at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20gen-official-bundle-catalog.ts%20at%20fcc0ad4.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
observed: 2026-11-05
locator: scripts/gen-official-bundle-catalog.ts:1-60; packages/boot/plugin-manager/src/registry.ts:1-20 at fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/marketplace-fields@dsh#observation-1
---

Imported from `facts/dsh/plugins/marketplace-fields.md`, observation 1.

- applicable: false
- note: "plugins install from npm registries through pnpm; the official on-demand catalog is generated inside the dsh repository from a fixed package list, not a file an author writes"
