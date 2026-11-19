---
kind: source
reportedIn:
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: _expandSkillCommand, L2302-L2304
excerpt:
  exact: 'const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();'
  prefix: "7) : text.slice(7, spaceIndex); "
  suffix: " const skill = this.resourceLoad"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();
