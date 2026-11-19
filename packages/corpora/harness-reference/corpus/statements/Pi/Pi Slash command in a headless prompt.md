---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: prompt start only
    arguments: all text after the first space, trimmed
    later_text: appended after the skill body as the user request
    not_at_start: not expanded; sent to the model as written
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi print mode prompt call](../../study-results/Pi/2026-11-14%20Pi%20print%20mode%20prompt%20call.md)"
      - "[2026-11-14 Pi prompt expansion](../../study-results/Pi/2026-11-14%20Pi%20prompt%20expansion.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Print mode sends the prompt through session.prompt, which expands skill commands and prompt templates.
  - hasEvidenceItems:
      - "[2026-11-14 Pi skill command start check](../../study-results/Pi/2026-11-14%20Pi%20skill%20command%20start%20check.md)"
      - "[2026-11-14 Pi skill command arguments](../../study-results/Pi/2026-11-14%20Pi%20skill%20command%20arguments.md)"
      - "[2026-11-14 Pi skill command block](../../study-results/Pi/2026-11-14%20Pi%20skill%20command%20block.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The text must start with /skill:; the text after the first space is trimmed and placed after the skill block.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs skill arguments](../../study-results/Pi/2026-11-14%20Pi%20docs%20skill%20arguments.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Skills page on arguments.
reportedIn:
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
  - "[Pi source print-mode.ts at v1.5.2](../../documents/github.com/Pi%20source%20print-mode.ts%20at%20v1.5.2.md)"
  - "[Pi docs Skills at v1.5.2](../../documents/github.com/Pi%20docs%20Skills%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Read from the source at v1.5.2; no headless run was made, so the statement is held at moderate and names no model. An unknown skill name is also passed through unchanged. Prompt templates (`/name`) follow the same start-of-prompt rule.
