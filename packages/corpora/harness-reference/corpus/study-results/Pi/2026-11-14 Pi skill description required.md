---
kind: source
reportedIn:
  - "[Pi source skills.ts at v1.5.2](../../documents/github.com/Pi%20source%20skills.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: loadSkillFromFile, L329-L332
excerpt:
  exact: "// Still load the skill even with warnings, unless description is missing or empty. if (!hasDescription) { return { skill: null, diagnostics }; }"
  prefix: "ge: error, path: filePath }); } "
  suffix: " return { skill: { name, descrip"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> // Still load the skill even with warnings, unless description is missing or empty. if (!hasDescription) { return { skill: null, diagnostics }; }
