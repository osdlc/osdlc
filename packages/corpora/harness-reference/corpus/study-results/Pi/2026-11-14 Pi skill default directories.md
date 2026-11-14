---
kind: source
reportedIn:
  - "[Pi source skills.ts at v1.5.2](../../documents/github.com/Pi%20source%20skills.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: loadSkills, L457-L460
excerpt:
  exact: addSkills(loadSkillsFromDirInternal(join(resolvedAgentDir, "skills"), "user", true)); addSkills(loadSkillsFromDirInternal(resolve(resolvedCwd, CONFIG_DIR_NAME, "skills"), "project", true));
  prefix: "); } } } if (includeDefaults) { "
  suffix: " } const userSkillsDir = join(re"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> addSkills(loadSkillsFromDirInternal(join(resolvedAgentDir, "skills"), "user", true)); addSkills(loadSkillsFromDirInternal(resolve(resolvedCwd, CONFIG_DIR_NAME, "skills"), "project", true));
