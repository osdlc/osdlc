---
proposition:
  subject: '[ccache](../../stores/ccache.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: ccache -C
      removes: the entire cache, keeping the configuration file
    - command: ccache --evict-older-than AGE
      removes: cache entries used less recently than AGE
    - command: ccache -M SIZE
      removes: nothing directly; sets the cache size cap, trimmed automatically
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 ccache clean command 1](../../study-results/ccache/2026-11-21%20ccache%20clean%20command%201.md)'
  - '[2026-11-21 ccache clean command 2](../../study-results/ccache/2026-11-21%20ccache%20clean%20command%202.md)'
  - '[2026-11-21 ccache clean command 3](../../study-results/ccache/2026-11-21%20ccache%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The manual describes --clear, --evict-older-than and --max-size.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[ccache](../../stores/ccache.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The manual describes --clear, --evict-older-than and --max-size.
