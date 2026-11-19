---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/headless-slash-command
  object:
    position: the first message must start with @<prompt-name>
    arguments: text after the name
    not_at_start: a name that matches no prompt is sent as typed
    note: Documented for prompts and SOPs (@agent-sop:<name>) from CLI 2.33, with --no-interactive too. The docs do not cover a skill slash command in a headless prompt; they say the interactive /model and /agent pickers are not available.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless prompt as first message](../../study-results/Kiro/2026-11-14%20kiro%20headless%20prompt%20as%20first%20message.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: a prompt named at the start of the first message runs."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless prompt arguments](../../study-results/Kiro/2026-11-14%20kiro%20headless%20prompt%20arguments.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: its arguments."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless prompt name not matched](../../study-results/Kiro/2026-11-14%20kiro%20headless%20prompt%20name%20not%20matched.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: an unmatched name."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless slash command limits](../../study-results/Kiro/2026-11-14%20kiro%20headless%20slash%20command%20limits.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: slash commands that are not available."
reportedIn:
  - "[Kiro docs Headless mode](../../documents/kiro.dev/Kiro%20docs%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
