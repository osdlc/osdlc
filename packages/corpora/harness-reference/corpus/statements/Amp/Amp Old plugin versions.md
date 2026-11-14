---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: plugins/upgrade-retention
  object:
    update: an update replaces the installed plugin file
    new_agent: a new thread loads the published version of personal and workspace plugins; a running thread does not reload after a push
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 auto-update replaces the plugin file](../../study-results/Amp/2026-11-14%20auto-update%20replaces%20the%20plugin%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The models and subagents page says an update replaces the plugin file.
  - hasEvidenceItems:
      - "[2026-11-14 new threads load the published version](../../study-results/Amp/2026-11-14%20new%20threads%20load%20the%20published%20version.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The global plugins page says which threads see a new version.
reportedIn:
  - "[Amp docs Models & Subagents](../../documents/ampcode.com/Amp%20docs%20Models%20&%20Subagents.md)"
  - "[Amp docs Global Plugins & Skills](../../documents/ampcode.com/Amp%20docs%20Global%20Plugins%20&%20Skills.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Amp Old plugin versions open](Amp%20Old%20plugin%20versions%20open.md)"
open:
  - "After amp plugins update or amp skill update, do old versions stay on disk?"
---

Whether an earlier version stays on disk is not stated; the question is kept in `open`.
