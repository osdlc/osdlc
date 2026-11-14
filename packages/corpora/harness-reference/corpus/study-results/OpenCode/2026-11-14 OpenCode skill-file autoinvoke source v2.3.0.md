---
kind: source
reportedIn:
  - "[OpenCode source config plugin skill-file.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill-file.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L48-L50"
excerpt:
  exact: 'const opencodeAutoinvoke = metadataBoolean(frontmatter.metadata, "opencode/autoinvoke") const disableModelInvocation = booleanValue(frontmatter["disable-model-invocation"]) const autoinvoke = opencodeAutoinvoke ?? (disableModelInvocation ? false : undefined)'
  prefix: "asename(path.dirname(filepath)) "
  suffix: ' return { _tag: "Parsed", skill:'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const opencodeAutoinvoke = metadataBoolean(frontmatter.metadata, "opencode/autoinvoke") const disableModelInvocation = booleanValue(frontmatter["disable-model-invocation"]) const autoinvoke = opencodeAutoinvoke ?? (disableModelInvocation ? false : undefined)
