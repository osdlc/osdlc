---
proposition:
  subject: '[vcpkg](../../stores/vcpkg.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: vcpkg remove --outdated
      removes: classic-mode installed packages that no longer match the available port versions
    - command: vcpkg install --clean-after-build
      removes: buildtrees, packages and downloads after building each package
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 vcpkg clean command 1](../../study-results/vcpkg/2026-11-21%20vcpkg%20clean%20command%201.md)'
  - '[2026-11-21 vcpkg clean command 2](../../study-results/vcpkg/2026-11-21%20vcpkg%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: vcpkg has no cache-clean command; the remove and install references document these options.
    The binary cache must be deleted by hand.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[vcpkg](../../stores/vcpkg.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No documented command prunes or clears the binary cache (archives) directory.
---

vcpkg has no cache-clean command; the remove and install references document these options. The binary cache must be deleted by hand.
