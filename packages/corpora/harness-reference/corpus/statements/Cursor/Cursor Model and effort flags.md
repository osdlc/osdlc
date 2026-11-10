---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/model-selection
  object:
    model: --model <model>
    model_list: --list-models or `agent models`
    effort: bracket override on the model slug, such as claude-opus-4-8[effort=high]
    context: bracket override context=1m
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help model](../../study-results/Cursor/2026-11-09%20Cursor%20help%20model.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Installed --help.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help list-models](../../study-results/Cursor/2026-11-09%20Cursor%20help%20list-models.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --list-models.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help models command](../../study-results/Cursor/2026-11-09%20Cursor%20help%20models%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`models` command."
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
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Model and effort flags](../../subjects/cli/Model%20and%20effort%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---



Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
