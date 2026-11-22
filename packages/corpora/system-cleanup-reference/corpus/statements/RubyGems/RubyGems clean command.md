---
proposition:
  subject: '[RubyGems](../../stores/RubyGems.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: gem cleanup
      removes: old versions of installed gems in GEM_HOME that no installed gem depends on, with their
        cached .gem files
    - command: gem cleanup -n
      removes: nothing; dry run listing what would be removed
    - command: gem cleanup --user-install
      removes: old gem versions in the user's home install directory
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 RubyGems clean command 1](../../study-results/RubyGems/2026-11-21%20RubyGems%20clean%20command%201.md)'
  - '[2026-11-21 RubyGems clean command 2](../../study-results/RubyGems/2026-11-21%20RubyGems%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The command reference and the caching guide both document gem cleanup and its dry-run flag.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[RubyGems](../../stores/RubyGems.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The command reference and the caching guide both document gem cleanup and its dry-run flag.
