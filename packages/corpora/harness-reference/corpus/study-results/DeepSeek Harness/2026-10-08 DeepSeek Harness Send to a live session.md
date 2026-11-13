---
kind: source
reportedIn:
  - "[DeepSeek Harness (dsh) harness notes for a dispatcher](../../documents/skillwright/DeepSeek%20Harness%20%28dsh%29%20harness%20notes%20for%20a%20dispatcher.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.1-alpha.1
version_basis: exact
observed: 2026-10-08
locator: deepseek-ai/deepseek-harness packages/acp/acp/README.md at 5badb150
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-08T00:00:00Z
imported_from: fact:cli/send-to-live@dsh#observation-1
---

Imported from `facts/dsh/cli/send-to-live.md`, observation 1.

- supported: "partial"
- headless: "no; one task per run"
- acp: "dsh --profile acp: session/prompt on a held-open process, one prompt at a time"
- sdk: "JSON-RPC with initialize, session/prompt, shutdown"
