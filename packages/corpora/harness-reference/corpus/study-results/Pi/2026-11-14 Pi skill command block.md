---
kind: source
reportedIn:
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: _expandSkillCommand, L2310-L2313
excerpt:
  exact: 'const content = readFileSync(skill.filePath, "utf-8"); const body = stripFrontmatter(content).trim(); const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`; return args ? `${skillBlock}\n\n${args}` : skillBlock;'
  prefix: "known skill, pass through try { "
  suffix: " } catch (err) { // Emit error l"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const content = readFileSync(skill.filePath, "utf-8"); const body = stripFrontmatter(content).trim(); const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`; return args ? `${skillBlock}\n\n${args}` : skillBlock;
