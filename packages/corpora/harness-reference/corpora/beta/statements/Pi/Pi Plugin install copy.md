---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: plugins/install-copy
  object:
    local_package: not copied; loaded in place
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Pi Plugin install copy](../../study-results/Pi/2026-11-04%20Pi%20Plugin%20install%20copy.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-09 Pi packages sources](../../study-results/Pi/2026-11-09%20Pi%20packages%20sources.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Local paths are loaded without copying.
reportedIn:
  - "[Pi docs Pi Packages (main at d57c2d2)](../../documents/github.com/Pi%20docs%20Pi%20Packages%20%28main%20at%20d57c2d2%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Plugin install copy](../../subjects/plugins/Plugin%20install%20copy.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - For npm and git installs, do exec bits and symlinks survive?
imported_from: fact:plugins/install-copy@pi#scope-[null,null,null]
---

Imported from `facts/pi/plugins/install-copy.md`.

Open questions:
- For npm and git installs, do exec bits and symlinks survive?

Rechecked 2026-11-09 against the installed pi 1.5.0 and the v1.5.0 source tree.
