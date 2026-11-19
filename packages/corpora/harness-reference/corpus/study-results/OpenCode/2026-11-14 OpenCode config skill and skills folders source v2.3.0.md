---
kind: source
reportedIn:
  - "[OpenCode source config plugin skill.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20config%20plugin%20skill.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L88-L91"
excerpt:
  exact: 'for (const directory of directories) { add(Skill.DirectorySource.make({ type: "directory", path: AbsolutePath.make(path.join(directory, "skill")) })) add(Skill.DirectorySource.make({ type: "directory", path: AbsolutePath.make(path.join(directory, "skills")) })) }'
  prefix: "entry.info.skills ?? []) : [])) "
  suffix: " for (const item of items) { if "
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> for (const directory of directories) { add(Skill.DirectorySource.make({ type: "directory", path: AbsolutePath.make(path.join(directory, "skill")) })) add(Skill.DirectorySource.make({ type: "directory", path: AbsolutePath.make(path.join(directory, "skills")) })) }
