---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: config/config-dir-env
  object:
    supported: true
    var: DSH_HOME
    sets:
      - profiles under $DSH_HOME/profiles
      - $DSH_HOME/cordis.patch.yml
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 reference dsh home](../../study-results/DeepSeek%20Harness/2026-11-09%20reference%20dsh%20home.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: source observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 reference profile dir](../../study-results/DeepSeek%20Harness/2026-11-09%20reference%20profile%20dir.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: source observed 2026-11-09.
reportedIn:
  - "[deepseek-ai deepseek-harness apps cli reference README at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20apps%20cli%20reference%20README%20at%20fcc0ad4.md)"
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
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: strength lowered
    date: 2026-11-14T18:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Config directory variable](../../subjects/config/Config%20directory%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Strength lowered on 2026-11-14: the evidence rated strong is README or guide prose in the repository, which this corpus counts as docs (moderate), not source. The study results keep their `kind`, since study results are not edited.
