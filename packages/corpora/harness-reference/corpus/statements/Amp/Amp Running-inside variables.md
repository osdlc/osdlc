---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/current-env
  object:
    supported: partial
    vars:
      - name: AMP_ORB
        value: "1"
        meaning: the process runs in an orb
    set_by: child-commands
    note: Set for processes in an orb, including the commands the agent runs. Not set when Amp runs on the user's own computer; the docs name no marker for a local run.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 AMP_ORB marker](../../study-results/Amp/2026-11-14%20AMP_ORB%20marker.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The orb customizing page states the variable, its value and where it is not set.
reportedIn:
  - "[Amp docs Customizing Orbs](../../documents/ampcode.com/Amp%20docs%20Customizing%20Orbs.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Running-inside variables](../../subjects/cli/Running-inside%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

