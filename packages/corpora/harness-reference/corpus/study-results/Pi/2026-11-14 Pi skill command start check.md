---
kind: source
reportedIn:
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: _expandSkillCommand, L2300
excerpt:
  exact: if (!text.startsWith("/skill:")) return text;
  prefix: "Command(text: string): string { "
  suffix: " const spaceIndex = text.indexOf"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if (!text.startsWith("/skill:")) return text;
