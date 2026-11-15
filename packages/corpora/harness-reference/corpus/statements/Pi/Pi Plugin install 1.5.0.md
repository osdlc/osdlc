---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: plugins/install
  object:
    commands:
      - pi install ./local-package
      - pi install git:github.com/example/pi-tools@v1
      - pi install npm:@example/pi-tools@1.0.0
      - pi install https://github.com/user/repo
    sources: npm, git (also a bare URL or ssh), or a local path
    recorded_in: packages in ~/.pi/agent/settings.json, or .pi/settings.json with -l
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Pi help install](../../study-results/Pi/2026-11-09%20Pi%20help%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`pi install --help` examples."
  - hasEvidenceItems:
      - "[2026-11-09 Pi packages install](../../study-results/Pi/2026-11-09%20Pi%20packages%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Packages page.
  - hasEvidenceItems:
      - "[2026-11-09 Pi packages settings files](../../study-results/Pi/2026-11-09%20Pi%20packages%20settings%20files.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Settings files.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Pi Plugin install](Pi%20Plugin%20install.md)"
open:
  - Is a plain string entry in `packages` accepted besides the object form with `source`? Only the object form is shown in the docs.
---

The earlier dispute was an incomplete old list. The earlier statement is kept, superseded.
