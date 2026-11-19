---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness boot packages at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20boot%20packages%20at%20fcc0ad4.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
observed: 2026-11-05
locator: packages/boot/app-boot/src/profile.ts:54-60, 548-562; packages/boot/plugin-manager/src/operations.ts:100-112 at fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-validation@dsh#observation-1
---

Imported from `facts/dsh/plugins/manifest-validation.md`, observation 1.

- unknown_fields: "ignored"
- invalid_fields: "a package.json that is not a JSON object, a dsh.bundle.patch that is not a string or list of strings fails the load; a platforms list that excludes the host skips the bundle; a package with no dsh.bundle installs with a warning as a plain dependency; dsh.manifestVersion and engines.dsh are not enforced"
