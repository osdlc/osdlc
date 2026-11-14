---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: cli/current-env
  object:
    supported: true
    vars:
      - name: DSH_SHELL
        value: "1"
        meaning: set on every model shell call (bash or pwsh)
    set_by: child-commands
    note: "The DSH_* variables are collected afresh for each shell call and replace any DSH_* values the process inherited."
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh shell-env built-in values](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20shell-env%20built-in%20values.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "collect() sets DSH_SHELL to 1 for every shell tool execution."
  - hasEvidenceItems:
      - "[2026-11-14 dsh shell-env every call receives](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20shell-env%20every%20call%20receives.md)"
      - "[2026-11-14 dsh shell-env managed environment](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20shell-env%20managed%20environment.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The shell-env README says every call receives DSH_SHELL=1 in a freshly collected environment."
reportedIn:
  - "[deepseek-ai deepseek-harness shell-env index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20shell-env%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness shell-env README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20shell-env%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Running-inside variables](../../subjects/cli/Running-inside%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
