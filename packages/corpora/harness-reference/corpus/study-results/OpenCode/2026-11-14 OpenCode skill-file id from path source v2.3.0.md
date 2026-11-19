---
kind: source
reportedIn:
  - "[OpenCode source config plugin skill-file.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill-file.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L44-L47"
excerpt:
  exact: 'const id = path.dirname(filepath) === directory && path.basename(filepath) !== "SKILL.md" ? path.basename(filepath, ".md") : path.basename(path.dirname(filepath))'
  prefix: "t frontmatter = decoded.success "
  suffix: " const opencodeAutoinvoke = meta"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const id = path.dirname(filepath) === directory && path.basename(filepath) !== "SKILL.md" ? path.basename(filepath, ".md") : path.basename(path.dirname(filepath))
