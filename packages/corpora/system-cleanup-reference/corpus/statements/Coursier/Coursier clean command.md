---
proposition:
  subject: '[Coursier](../../stores/Coursier.md)'
  predicate: clean/command
  object:
    supported: false
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Coursier clean command 1](../../study-results/Coursier/2026-11-21%20Coursier%20clean%20command%201.md)'
  - '[2026-11-21 Coursier clean command 2](../../study-results/Coursier/2026-11-21%20Coursier%20clean%20command%202.md)'
  - '[2026-11-21 Coursier clean command 3](../../study-results/Coursier/2026-11-21%20Coursier%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The docs offer no cache-cleaning command; an open issue confirms it and a maintainer says
    the cache folder can simply be deleted. cs uninstall only removes installed app launchers.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Coursier](../../stores/Coursier.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- cs uninstall removes app launchers, not cached artifacts or JVMs.
---

The docs offer no cache-cleaning command; an open issue confirms it and a maintainer says the cache folder can simply be deleted. cs uninstall only removes installed app launchers.
