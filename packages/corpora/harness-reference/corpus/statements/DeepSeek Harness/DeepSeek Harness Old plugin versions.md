---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: plugins/upgrade-retention
  object:
    old_version_kept: false
    mechanism: update removes the installed version, then installs the exact newer version
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 DeepSeek Harness Old plugin versions](../../study-results/DeepSeek%20Harness/2026-11-04%20DeepSeek%20Harness%20Old%20plugin%20versions.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: source observed 2026-11-04.
reportedIn:
  - "[dsh plugin-manager package README](../../documents/github.com/dsh%20plugin-manager%20package%20README.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: strength lowered
    date: 2026-11-14T18:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/upgrade-retention@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/plugins/upgrade-retention.md`.

Strength lowered on 2026-11-14: the evidence rated strong is README or guide prose in the repository, which this corpus counts as docs (moderate), not source. The study results keep their `kind`, since study results are not edited.
