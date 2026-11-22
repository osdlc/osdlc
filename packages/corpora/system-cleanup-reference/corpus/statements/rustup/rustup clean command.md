---
proposition:
  subject: '[rustup](../../stores/rustup.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: rustup toolchain uninstall
      removes: the given toolchains (e.g. rustup toolchain uninstall nightly)
    - command: rustup update
      removes: contents of the downloads and tmp directories after updating all channels
    - command: rustup self uninstall
      removes: rustup and all of its toolchains
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 rustup clean command 1](../../study-results/rustup/2026-11-21%20rustup%20clean%20command%201.md)'
  - '[2026-11-21 rustup clean command 2](../../study-results/rustup/2026-11-21%20rustup%20clean%20command%202.md)'
  - '[2026-11-21 rustup clean command 3](../../study-results/rustup/2026-11-21%20rustup%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The CLI source documents toolchain uninstall and the cleanup step at the end of rustup
    update; the installation page documents self uninstall.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[rustup](../../stores/rustup.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- rustup has no command to prune unused or outdated toolchains automatically.
---

The CLI source documents toolchain uninstall and the cleanup step at the end of rustup update; the installation page documents self uninstall.
