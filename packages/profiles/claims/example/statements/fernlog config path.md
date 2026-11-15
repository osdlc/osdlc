---
proposition:
  subject: fernlog 2.3
  predicate: reads config from
  object: ~/.config/fernlog/config.toml
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[README on config](../study-results/README%20on%20config.md)"
      - "[Linux probe](../study-results/linux/Linux%20probe/Linux%20probe.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: >-
      The README names this path, and a test run on Linux shows fernlog reading it and nothing
      else.
  - hasEvidenceItems:
      - "[macOS probe](../study-results/macos/macOS%20probe.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: moderate
    description: >-
      On macOS fernlog reads ~/Library/Application Support/fernlog/config.toml and ignores this
      path. One machine, so it may not hold for every macOS setup.
contributions:
  - contributor: { name: Sam Example, agentType: person }
    activityType: created
    date: 2026-11-03T10:00:00Z
---

The claim holds on Linux and does not hold on macOS. The README and the Linux run agree, so the
supporting line is strong. The macOS run disputes the claim for that system. The verdict is
supports, with moderate strength, because the claim is true where the README says it is and false
on one system the README does not mention.

A sharper claim would name the system: "fernlog 2.3 on Linux reads config from
`~/.config/fernlog/config.toml`". That is a separate statement,
[fernlog config path on Linux](fernlog%20config%20path%20on%20Linux.md), and it cites the same
study results.
