---
kind: changelog
reportedIn:
  - "[Cursor CLI changelog](../../documents/Anysphere/Cursor%20CLI%20changelog.md)"
harness: "[Cursor](../../harnesses/Cursor.md)"
version: 2026.10.08
version_basis: exact
observed: 2026-11-14
locator: v2026.10.08 > Skills
excerpt:
  exact: Skills that load but exceed the spec's limits now show a yellow warning count in `/skills`, and selecting one lists what to fix under it. Warnings cover a name over 64 characters or not in lowercase-hyphen form, a frontmatter `name` that doesn't match the folder, a description over 1,024 characters, and a body over about 5,000 tokens.
  prefix: "reak the Agent Skills limits.** "
  suffix: " See the [SKILL.md format](https"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> Skills that load but exceed the spec's limits now show a yellow warning count in `/skills`, and selecting one lists what to fix under it. Warnings cover a name over 64 characters or not in lowercase-hyphen form, a frontmatter `name` that doesn't match the folder, a description over 1,024 characters, and a body over about 5,000 tokens.
