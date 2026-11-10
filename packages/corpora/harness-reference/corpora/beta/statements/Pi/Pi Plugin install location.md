---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: plugins/install-location
  object:
    declaration_file: ~/.pi/agent/settings.json (personal) or .pi/settings.json (--local)
    local: loaded from the resolved path without copying
    npm: installed under the Pi npm directory
    git: cloned and reconciled to the selected ref
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Pi Plugin install location](../../study-results/Pi/2026-11-04%20Pi%20Plugin%20install%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Pi Plugin install location 2](../../study-results/Pi/2026-11-04%20Pi%20Plugin%20install%20location%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Pi docs Pi Packages (main at d57c2d2)](../../documents/github.com/Pi%20docs%20Pi%20Packages%20%28main%20at%20d57c2d2%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - What are the exact on-disk directories for npm and git package installs?
imported_from: fact:plugins/install-location@pi#scope-[null,null,null]
---

Imported from `facts/pi/plugins/install-location.md`.

Open questions:
- What are the exact on-disk directories for npm and git package installs?
