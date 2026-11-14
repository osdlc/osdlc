---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: meta/version-seen
  object:
    version: 0.0.1794643233-g7a2d30
    context: latest release in the vendor's Homebrew tap formula
    observed: 2026-11-14
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 homebrew formula version](../../study-results/Amp/2026-11-14%20homebrew%20formula%20version.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The formula in ampcode/homebrew-tap names the version.
reportedIn:
  - "[ampcode homebrew-tap ampcode.rb at e4b0fe0](../../documents/github.com/ampcode%20homebrew-tap%20ampcode.rb%20at%20e4b0fe0.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Version seen](../../subjects/meta/Version%20seen.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Lowered to moderate: the formula is the vendor's release file, not the harness source. The npm registry showed the same version as `latest` for `@ampcode/cli` on the same day.
