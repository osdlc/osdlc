---
kind: source
reportedIn:
  - "[OpenCode source config plugin skill-file.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill-file.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L10-L15"
excerpt:
  exact: 'const Frontmatter = Schema.Struct({ name: Schema.String.pipe(Schema.optional), description: Schema.String.pipe(Schema.optional), metadata: Schema.Unknown.pipe(Schema.optional), "disable-model-invocation": Schema.Unknown.pipe(Schema.optional), })'
  prefix: '{ Skill } from "../../skill.js" '
  suffix: " const decodeFrontmatter = Schem"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const Frontmatter = Schema.Struct({ name: Schema.String.pipe(Schema.optional), description: Schema.String.pipe(Schema.optional), metadata: Schema.Unknown.pipe(Schema.optional), "disable-model-invocation": Schema.Unknown.pipe(Schema.optional), })
