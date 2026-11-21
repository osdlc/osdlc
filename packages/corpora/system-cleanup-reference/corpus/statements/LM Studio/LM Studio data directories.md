---
proposition:
  subject: '[LM Studio](../../stores/LM%20Studio.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.lmstudio/models
      holds: models
      rebuild: re-download
    - platform: macos
      path: ~/.lmstudio/conversations
      holds: state
      rebuild: lost
    - platform: linux
      path: ~/.lmstudio/conversations
      holds: state
      rebuild: lost
    - platform: windows
      path: '%USERPROFILE%\.lmstudio\conversations'
      holds: state
      rebuild: lost
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 LM Studio data directories 1](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20data%20directories%201.md)'
  - '[2026-11-21 LM Studio data directories 2](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20data%20directories%202.md)'
  - '[2026-11-21 LM Studio data directories 3](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20data%20directories%203.md)'
  - '[2026-11-21 LM Studio data directories 4](../../study-results/LM%20Studio/2026-11-21%20LM%20Studio%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The docs give ~/.lmstudio/models as the expected models directory with no per-platform
    variant (so macOS uses the same path); models downloaded in-app can be fetched again, but `lms import`
    moves a user's own file into this tree by default, so an imported model deleted there is lost.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[LM Studio](../../stores/LM%20Studio.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No LM Studio page spells out the Windows models path; by analogy it is %USERPROFILE%\.lmstudio\models,
  but that is not quoted.
- Older releases reportedly used ~/.cache/lm-studio/models; no current primary source confirms it.
- The docs give no way to tell an imported model from a downloaded one by its files.
---

The docs give ~/.lmstudio/models as the expected models directory with no per-platform variant (so macOS uses the same path); models downloaded in-app can be fetched again, but `lms import` moves a user's own file into this tree by default, so an imported model deleted there is lost.
