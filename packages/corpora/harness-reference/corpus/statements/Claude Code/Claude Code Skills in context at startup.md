---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: skills/startup-context
  object:
    listed: name and description of each skill
    every_name_listed: true
    budget: 1% of the model context window
    over_budget: descriptions dropped, least-invoked skills first
    per_entry_cap_chars: "1536"
    cap_covers: description plus when_to_use
    configurable_by: skillListingMaxDescChars setting; budget by skillListingBudgetFraction setting or SLASH_COMMAND_TOOL_CHAR_BUDGET
    name_only_option: skillOverrides set to name-only lists a skill without its description
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skills in context at startup](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skills%20in%20context%20at%20startup.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skills in context at startup 2](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skills%20in%20context%20at%20startup%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Claude Code Skills in context at startup 3](../../study-results/Claude%20Code/2026-11-04%20Claude%20Code%20Skills%20in%20context%20at%20startup%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Claude Code docs skills](../../documents/code.claude.com/Claude%20Code%20docs%20skills.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Skills in context at startup](../../subjects/skills/Skills%20in%20context%20at%20startup.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/startup-context@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/skills/startup-context.md`.
