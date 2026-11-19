---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: cli/session-env
  object:
    vars:
      - DSH_HOME
      - DSH_SHELL
      - DSH_SESSION_ID
      - DSH_NODE_EXECUTABLE
      - DSH_PROFILE
      - DSH_PROFILE_DIR
      - DSH_INSTALL_DIR
    note: "Set on each model shell call. DSH_SESSION_ID is set for agent calls, DSH_NODE_EXECUTABLE outside a single-executable build, and DSH_PROFILE, DSH_PROFILE_DIR and DSH_INSTALL_DIR when the launcher gave a profile. The web app adds DSH_WEB_URL when its surfaceContext is true. Plugins can register more DSH_* variables."
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh shell-env reserved keys](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20shell-env%20reserved%20keys.md)"
      - "[2026-11-14 dsh shell-env built-in values](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20shell-env%20built-in%20values.md)"
      - "[2026-11-14 dsh shell-env session id value](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20shell-env%20session%20id%20value.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The shell-env registry reserves these seven built-in keys and sets them in collect()."
  - hasEvidenceItems:
      - "[2026-11-14 dsh shell-env every call receives](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20shell-env%20every%20call%20receives.md)"
      - "[2026-11-14 dsh shell-env node executable](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20shell-env%20node%20executable.md)"
      - "[2026-11-14 dsh shell-env profile variables](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20shell-env%20profile%20variables.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The shell-env README lists the same variables and when each is present."
  - hasEvidenceItems:
      - "[2026-11-14 dsh web-app DSH_WEB_URL](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20web-app%20DSH_WEB_URL.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The web-app README says DSH_WEB_URL is in the managed bash environment when surfaceContext is true."
reportedIn:
  - "[deepseek-ai deepseek-harness shell-env index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20shell-env%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness shell-env README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20shell-env%20README%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness web-app README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20web-app%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Session environment](../../subjects/cli/Session%20environment.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
