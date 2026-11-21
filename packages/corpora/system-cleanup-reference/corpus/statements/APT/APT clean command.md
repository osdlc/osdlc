---
proposition:
  subject: '[APT](../../stores/APT.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: apt-get clean
      removes: everything but the lock file in /var/cache/apt/archives and its partial directory
    - command: apt-get autoclean
      removes: cached package files that can no longer be downloaded
    - command: apt-get autoremove
      removes: automatically installed dependencies no longer needed
    - command: apt-get autopurge
      removes: the same as autoremove, plus their configuration files
    - command: apt-get distclean
      removes: everything under /var/lib/apt/lists except Release, Release.gpg and InRelease
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 APT clean command 1](../../study-results/APT/2026-11-21%20APT%20clean%20command%201.md)'
  - '[2026-11-21 APT clean command 2](../../study-results/APT/2026-11-21%20APT%20clean%20command%202.md)'
  - '[2026-11-21 APT clean command 3](../../study-results/APT/2026-11-21%20APT%20clean%20command%203.md)'
  - '[2026-11-21 APT clean command 4](../../study-results/APT/2026-11-21%20APT%20clean%20command%204.md)'
  - '[2026-11-21 APT clean command 5](../../study-results/APT/2026-11-21%20APT%20clean%20command%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: All commands come from apt-get(8) in Debian trixie (apt 3.0.3); they need root.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[APT](../../stores/APT.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

All commands come from apt-get(8) in Debian trixie (apt 3.0.3); they need root.
