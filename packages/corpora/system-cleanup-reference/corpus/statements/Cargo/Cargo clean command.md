---
proposition:
  subject: '[Cargo](../../stores/Cargo.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: cargo clean
      removes: the whole target directory of the current workspace
    - command: cargo clean gc -Zgc --max-download-age=DURATION
      removes: global cache files unused for the given age (nightly-only, unstable)
    - command: cargo (any build command, automatic)
      removes: global cache files unused for 3 months (downloaded) or 1 month (locally regenerable), checked
        by default once a day
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cargo clean command 1](../../study-results/Cargo/2026-11-21%20Cargo%20clean%20command%201.md)'
  - '[2026-11-21 Cargo clean command 2](../../study-results/Cargo/2026-11-21%20Cargo%20clean%20command%202.md)'
  - '[2026-11-21 Cargo clean command 3](../../study-results/Cargo/2026-11-21%20Cargo%20clean%20command%203.md)'
  - '[2026-11-21 Cargo clean command 4](../../study-results/Cargo/2026-11-21%20Cargo%20clean%20command%204.md)'
  - '[2026-11-21 Cargo clean command 5](../../study-results/Cargo/2026-11-21%20Cargo%20clean%20command%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Stable Cargo (1.88+) garbage-collects its global cache automatically; manual `cargo clean
    gc` still needs -Zgc on nightly; `cargo clean` removes a workspace's target directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cargo](../../stores/Cargo.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Stable Cargo (1.88+) garbage-collects its global cache automatically; manual `cargo clean gc` still needs -Zgc on nightly; `cargo clean` removes a workspace's target directory.
