---
proposition:
  subject: '[proto](../../stores/proto.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: proto clean
      removes: stale and unused tools, plugins, cache, temp files and trust records not used in the last
        30 days (default target is everything)
    - command: proto clean tools --days 30
      removes: tool versions not used within the given number of days
    - command: proto clean cache
      removes: the cache target
    - command: proto clean temp
      removes: the temp (downloads) target
    - command: proto uninstall
      removes: a specific installed version of a tool, or all versions when no version is given
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 proto clean command 1](../../study-results/proto/2026-11-21%20proto%20clean%20command%201.md)'
  - '[2026-11-21 proto clean command 2](../../study-results/proto/2026-11-21%20proto%20clean%20command%202.md)'
  - '[2026-11-21 proto clean command 3](../../study-results/proto/2026-11-21%20proto%20clean%20command%203.md)'
  - '[2026-11-21 proto clean command 4](../../study-results/proto/2026-11-21%20proto%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The clean and uninstall command pages describe the targets and what is removed.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[proto](../../stores/proto.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The clean and uninstall command pages describe the targets and what is removed.
