---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/append-system-prompt
  object:
    supported: false
    basis: omitted-from-help
    note: no system-prompt flag in `agent --help`; the TypeScript SDK's `systemPrompt` option replaces the built-in prompt, for local agents only
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Cursor help full option list](../../study-results/Cursor/2026-11-14%20Cursor%20help%20full%20option%20list.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The option list of the installed CLI has no flag that adds system or developer instructions.
  - hasEvidenceItems:
      - "[2026-11-14 Cursor SDK systemPrompt](../../study-results/Cursor/2026-11-14%20Cursor%20SDK%20systemPrompt.md)"
    directionOfEvidenceProvided: neutral
    description: The SDK option replaces the system prompt; it is not a CLI flag and does not append.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Absence in `agent --help` only. The SDK page says a failed `systemPrompt` call names `--system-prompt`, but the help text lists no such flag, so none is recorded.
