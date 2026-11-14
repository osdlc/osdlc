---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: plugins/upgrade-retention
  object:
    old_version_kept: false
    update: replaces the installed copy in place
    mechanism: "git packages: git reset --hard to the new commit, then git clean -fdx, in the same checkout; npm packages: npm install into the same install root"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi package git update reset](../../study-results/Pi/2026-11-14%20Pi%20package%20git%20update%20reset.md)"
      - "[2026-11-14 Pi package git update clean](../../study-results/Pi/2026-11-14%20Pi%20package%20git%20update%20clean.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: A git package is reset and cleaned in its one checkout.
  - hasEvidenceItems:
      - "[2026-11-14 Pi package npm update](../../study-results/Pi/2026-11-14%20Pi%20package%20npm%20update.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: An npm update runs the package manager's install against the same prefix. That npm then replaces the old copy is npm behaviour, not Pi code.
reportedIn:
  - "[Pi source package-manager.ts at v1.5.2](../../documents/github.com/Pi%20source%20package-manager.ts%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Old plugin versions](../../subjects/plugins/Old%20plugin%20versions.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Read from the source at v1.5.2, not run. Pi keeps no versioned cache folder for packages.
