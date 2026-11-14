---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness skill-filesystem index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20skill-filesystem%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/skill/skill-filesystem/src/index.ts#L744-L745 at 39163dd"
excerpt:
  exact: "? { path: join(entry.path, 'SKILL.md'), directory: entry.path } : entry.type === 'file' && entry.name.endsWith('.md')"
  prefix: "or = entry.type === 'directory' "
  suffix: " ? { path: entry.path, directory"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> ? { path: join(entry.path, 'SKILL.md'), directory: entry.path } : entry.type === 'file' && entry.name.endsWith('.md')
