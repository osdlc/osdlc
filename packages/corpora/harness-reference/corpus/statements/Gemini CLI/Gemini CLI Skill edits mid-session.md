---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/live-reload
  object:
    supported: partial
    command: /skills reload
    scope: extensions
    restart_needed: true
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Gemini CLI Skill edits mid-session](../../study-results/Gemini%20CLI/2026-11-04%20Gemini%20CLI%20Skill%20edits%20mid-session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Gemini CLI Skill edits mid-session 2](../../study-results/Gemini%20CLI/2026-11-04%20Gemini%20CLI%20Skill%20edits%20mid-session%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Gemini CLI docs Getting started with skills](../../documents/geminicli.com/Gemini%20CLI%20docs%20Getting%20started%20with%20skills.md)"
  - "[Gemini CLI docs Extension reference](../../documents/geminicli.com/Gemini%20CLI%20docs%20Extension%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Skill edits mid-session](../../subjects/skills/Skill%20edits%20mid-session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does a skill file edited or added on disk, without running /skills reload, take effect in a running session?
imported_from: fact:skills/live-reload@gemini-cli#scope-[null,null,null]
---

Imported from `facts/gemini-cli/skills/live-reload.md`.

Open questions:
- Does a skill file edited or added on disk, without running /skills reload, take effect in a running session?
