---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: skills/live-reload
  object:
    supported: true
    catalog: watched roots refresh the catalog without a restart
    body: every load re-reads the current file
    resource_edits: edits below references, scripts and assets do not trigger a refresh
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 DeepSeek Harness Skill edits mid-session](../../study-results/DeepSeek%20Harness/2026-11-04%20DeepSeek%20Harness%20Skill%20edits%20mid-session.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: source observed 2026-11-04.
reportedIn:
  - "[dsh skill-filesystem package README](../../documents/github.com/dsh%20skill-filesystem%20package%20README.md)"
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
subject: "[Skill edits mid-session](../../subjects/skills/Skill%20edits%20mid-session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/live-reload@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/skills/live-reload.md`.

Strength lowered on 2026-11-14: the evidence rated strong is README or guide prose in the repository, which this corpus counts as docs (moderate), not source. The study results keep their `kind`, since study results are not edited.
