---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: plugins/install-location
  object:
    format: npm package installed through pnpm
    dev_install: "link: dependency on a workspace package directory"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 DeepSeek Harness Plugin install location](../../study-results/DeepSeek%20Harness/2026-11-04%20DeepSeek%20Harness%20Plugin%20install%20location.md)"
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
subject: "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which folder holds an installed plugin package, and where is it relative to the profile directory?
imported_from: fact:plugins/install-location@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/plugins/install-location.md`.

Open questions:
- Which folder holds an installed plugin package, and where is it relative to the profile directory?

Strength lowered on 2026-11-14: the evidence rated strong is README or guide prose in the repository, which this corpus counts as docs (moderate), not source. The study results keep their `kind`, since study results are not edited.
