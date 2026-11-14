---
kind: source
reportedIn:
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: _expandSkillCommand, L2306-L2307
excerpt:
  exact: const skill = this.resourceLoader.getSkills().skills.find((s) => s.name === skillName); if (!skill) return text; // Unknown skill, pass through
  prefix: "t.slice(spaceIndex + 1).trim(); "
  suffix: " try { const content = readFileS"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const skill = this.resourceLoader.getSkills().skills.find((s) => s.name === skillName); if (!skill) return text; // Unknown skill, pass through
