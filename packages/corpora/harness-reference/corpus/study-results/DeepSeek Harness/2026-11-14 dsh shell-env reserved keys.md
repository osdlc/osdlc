---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness shell-env index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20shell-env%20index.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/shell/shell-env/src/index.ts#L82-L90 at 39163dd"
excerpt:
  exact: "const RESERVED_BASH_ENV_KEYS = new Set<DshEnvironmentKey>([ DSH_HOME_ENV, DSH_SHELL_KEY, DSH_SESSION_ID_KEY, DSH_PROFILE_KEY, DSH_PROFILE_DIR_KEY, DSH_INSTALL_DIR_KEY, DSH_NODE_EXECUTABLE_KEY, ])"
  prefix: "REFIX}NODE_EXECUTABLE` as const "
  suffix: " const BASH_ENV_KEY_SUFFIX = /^["
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> const RESERVED_BASH_ENV_KEYS = new Set<DshEnvironmentKey>([ DSH_HOME_ENV, DSH_SHELL_KEY, DSH_SESSION_ID_KEY, DSH_PROFILE_KEY, DSH_PROFILE_DIR_KEY, DSH_INSTALL_DIR_KEY, DSH_NODE_EXECUTABLE_KEY, ])
