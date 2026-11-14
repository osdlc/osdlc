---
kind: source
reportedIn:
  - "[Pi source skills.ts at v1.5.2](../../documents/github.com/Pi%20source%20skills.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: formatSkillsForPrompt, L377-L383
excerpt:
  exact: lines.push(` <name>${escapeXml(skill.name)}</name>`); lines.push(` <description>${escapeXml(skill.description)}</description>`); lines.push(` <location>${escapeXml(skill.filePath)}</location>`);
  prefix: 'ills) { lines.push(" <skill>"); '
  suffix: ' lines.push(" </skill>"); } line'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> lines.push(` <name>${escapeXml(skill.name)}</name>`); lines.push(` <description>${escapeXml(skill.description)}</description>`); lines.push(` <location>${escapeXml(skill.filePath)}</location>`);
