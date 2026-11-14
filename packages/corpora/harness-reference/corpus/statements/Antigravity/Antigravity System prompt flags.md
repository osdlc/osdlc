---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: partial
    basis: undocumented
    note: the documented flag list has no system prompt flag; --agent <name> runs a custom agent, and the Markdown body of that agent file is its system prompt
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 reference agent flag](../../study-results/Antigravity/2026-11-14%20reference%20agent%20flag.md)"
      - "[2026-11-14 subagents system prompt body](../../study-results/Antigravity/2026-11-14%20subagents%20system%20prompt%20body.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: The flag table lists --agent, and the subagents page says the body of an agent file is its system prompt. That no flag sets the prompt directly rests on the flag table leaving one out, so this is weak.
reportedIn:
  - "[Antigravity docs CLI commands](../../documents/antigravity.google/Antigravity%20docs%20CLI%20commands.md)"
  - "[Antigravity docs Subagents](../../documents/antigravity.google/Antigravity%20docs%20Subagents.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The command-line flag table names no flag that replaces or appends to the system prompt. The table is not complete (the changelog mentions a `--settings` flag it does not list), so the absence is weak evidence. The documented route is a custom agent file selected with `--agent`.
