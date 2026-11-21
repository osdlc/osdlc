---
proposition:
  subject: '[Zig](../../stores/Zig.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: zig env
      shows: the lib path, std path, global cache directory and version
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Zig inventory command 1](../../study-results/Zig/2026-11-21%20Zig%20inventory%20command%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: main.zig's usage text describes zig env, and print_env.zig emits a global_cache_dir field;
    it shows the location, not sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Zig](../../stores/Zig.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

main.zig's usage text describes zig env, and print_env.zig emits a global_cache_dir field; it shows the location, not sizes.
