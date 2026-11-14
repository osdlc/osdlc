---
kind: source
reportedIn:
  - "[Qwen Code source skill-manager.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20skill-manager.ts%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: "#L984-L994"
excerpt:
  exact: "const dirs = SKILL_PROVIDER_CONFIG_DIRS.map((v) => path.resolve( v === QWEN_DIR ? path.join(Storage.getGlobalQwenDir(), SKILLS_CONFIG_DIR) : path.join(os.homedir(), v, SKILLS_CONFIG_DIR), ), );"
  prefix: "t, so it deliberately does not. "
  suffix: " for (const customDir of this.co"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const dirs = SKILL_PROVIDER_CONFIG_DIRS.map((v) => path.resolve( v === QWEN_DIR ? path.join(Storage.getGlobalQwenDir(), SKILLS_CONFIG_DIR) : path.join(os.homedir(), v, SKILLS_CONFIG_DIR), ), );
