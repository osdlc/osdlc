---
kind: source
reportedIn:
  - "[Qwen Code source skill-manager.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20skill-manager.ts%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: "#L754-L760"
excerpt:
  exact: if (nameRaw == null || nameRaw === '') { throw new Error('Missing "name" in frontmatter'); }
  prefix: "w = frontmatter['description']; "
  suffix: " if (descriptionRaw == null || d"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if (nameRaw == null || nameRaw === '') { throw new Error('Missing "name" in frontmatter'); }
