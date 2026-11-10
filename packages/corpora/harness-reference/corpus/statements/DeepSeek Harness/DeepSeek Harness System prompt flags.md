---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: false
    note: No system-prompt option in the launcher or headless help. The persona is the personaPrefix and personaSuffix settings of the system-prompt row. The README says to remove the 'Your working directory is {{cwd}}.' clause from personaSuffix settings because the loop does not register {{cwd}} and an unresolved reference fails prompt assembly.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 launcher help version](../../study-results/DeepSeek%20Harness/2026-11-09%20launcher%20help%20version.md)"
      - "[2026-11-09 headless help usage](../../study-results/DeepSeek%20Harness/2026-11-09%20headless%20help%20usage.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: >-
      The launcher and headless help listings in cli-help.md have no system prompt option. Absence in
      a source listing is moderate.
  - hasEvidenceItems:
      - "[2026-11-09 persona cwd unresolved](../../study-results/DeepSeek%20Harness/2026-11-09%20persona%20cwd%20unresolved.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The README says to remove the {{cwd}} clause from personaSuffix settings.
  - hasEvidenceItems:
      - "[2026-11-09 persona prefix global](../../study-results/DeepSeek%20Harness/2026-11-09%20persona%20prefix%20global.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The README lists personaPrefix, the global persona prefix template.
  - hasEvidenceItems:
      - "[2026-11-09 persona cwd not registered](../../study-results/DeepSeek%20Harness/2026-11-09%20persona%20cwd%20not%20registered.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The README says the loop does not register {{cwd}}, so an unresolved reference fails prompt assembly.
reportedIn:
  - "[deepseek-ai deepseek-harness system-prompt README at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20system-prompt%20README%20at%20fcc0ad4.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---


