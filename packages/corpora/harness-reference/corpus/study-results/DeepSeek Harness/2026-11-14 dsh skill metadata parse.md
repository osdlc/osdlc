---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/skill/skill-filesystem/src/index.ts#L1054-L1060 at 39163dd"
excerpt:
  exact: "function optionalMetadata(data: Record<string, unknown>): { metadata?: Record<string, unknown> } { const value = data.metadata if (typeof value === 'object' && value !== null && !Array.isArray(value)) { return { metadata: value as Record<string, unknown> } } return {} }"
  prefix: " \"${key}\" must be a boolean`) } "
  suffix: " function errorMessage(error: un"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> function optionalMetadata(data: Record<string, unknown>): { metadata?: Record<string, unknown> } { const value = data.metadata if (typeof value === 'object' && value !== null && !Array.isArray(value)) { return { metadata: value as Record<string, unknown> } } return {} }
