---
proposition:
  subject: fernlog 2.3
  predicate: reads config from
  object:
    - platform: linux
      path: $XDG_CONFIG_HOME/fernlog/config.toml
      precedence: 1
    - platform: linux
      path: ~/.config/fernlog/config.toml
      precedence: 2
    - platform: macos
      path: ~/Library/Application Support/fernlog/config.toml
      precedence: 1
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[README on config](../study-results/README%20on%20config.md)"
      - "[Linux probe](../study-results/linux/Linux%20probe/Linux%20probe.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: >-
      The README names both Linux paths and says the XDG path wins when XDG_CONFIG_HOME is set. The
      Linux run confirms the second path. It ran with XDG_CONFIG_HOME unset, so it does not test
      the first.
  - hasEvidenceItems:
      - "[macOS probe](../study-results/macos/macOS%20probe.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: >-
      On macOS fernlog read the Application Support path on every run. One machine, so it may not
      hold for every macOS setup.
contributions:
  - contributor: { name: Sam Example, agentType: person }
    activityType: created
    date: 2026-11-05T10:00:00Z
---

Where fernlog 2.3 looks for its config on each platform. The object is a list with one entry per
path. `precedence` says which path wins on that platform when more than one applies: 1 wins.

The macOS run disputes [fernlog config path](fernlog%20config%20path.md), because that statement
names one path for every platform. Here the same run supports the claim, because this statement
names a path per platform.

The strength is moderate, not strong. The XDG path rests on the README alone, and the macOS path
rests on one machine.
