---
kind: source
reportedIn:
  - "[DeepSeek Harness (dsh) harness notes for a dispatcher](../../documents/skillwright/DeepSeek%20Harness%20%28dsh%29%20harness%20notes%20for%20a%20dispatcher.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.1-alpha.1
version_basis: exact
observed: 2026-10-08
locator: deepseek-ai/deepseek-harness apps/cli/README.md and apps/cli/reference/README.md at 5badb150
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-08T00:00:00Z
imported_from: fact:config/main-file@dsh#observation-1
---

Imported from `facts/dsh/config/main-file.md`, observation 1.

- file: "cordis.patch.yml layers: bundle patches, $DSH_HOME/profiles/<name>, $DSH_HOME, then --patch files"
- format: "YAML"
- merge: "a later layer replaces a row's whole config"
