---
kind: source
reportedIn:
  - "[Qwen Code source skill-manager.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20skill-manager.ts%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: "#L979-L983"
excerpt:
  exact: "case 'project': return SKILL_PROVIDER_CONFIG_DIRS.map((v) => path.join(this.config.getProjectRoot(), v, SKILLS_CONFIG_DIR), );"
  prefix: "l): string[] { switch (level) { "
  suffix: " case 'user': { // Resolve the d"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> case 'project': return SKILL_PROVIDER_CONFIG_DIRS.map((v) => path.join(this.config.getProjectRoot(), v, SKILLS_CONFIG_DIR), );
