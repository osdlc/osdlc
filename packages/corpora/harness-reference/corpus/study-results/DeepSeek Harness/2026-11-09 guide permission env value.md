---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness headless-policy-composition guide at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20headless-policy-composition%20guide%20at%20fcc0ad4.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.1
version_basis: inferred
observed: 2026-11-09
locator: Headless policy
excerpt:
  exact: "mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'"
  prefix: "ndbox-policy inject: [] config: "
  suffix: " workspaceRoot: !!js process.cwd"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T00:00:00Z
---

> mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
