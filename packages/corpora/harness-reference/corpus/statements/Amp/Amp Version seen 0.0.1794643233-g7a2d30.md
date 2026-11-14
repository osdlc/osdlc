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
  - hasEvidenceItems:
      - "[2026-11-14 cli-version.txt latest version](../../study-results/Amp/2026-11-14%20cli-version.txt%20latest%20version.md)"
      - "[2026-11-14 npm ampcode cli latest version](../../study-results/Amp/2026-11-14%20npm%20ampcode%20cli%20latest%20version.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The vendor's cli-version.txt and the npm registry entry for @ampcode/cli name the same version as latest.
reportedIn:
  - "[ampcode homebrew-tap ampcode.rb at e4b0fe0](../../documents/github.com/ampcode%20homebrew-tap%20ampcode.rb%20at%20e4b0fe0.md)"
  - "[Amp CLI version file](../../documents/Amp%20Frontier%20Corporation/Amp%20CLI%20version%20file.md)"
  - "[npm registry ampcode cli latest](../../documents/Amp%20Frontier%20Corporation/npm%20registry%20ampcode%20cli%20latest.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-14T18:00:00Z
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

Checked on 2026-11-14 against two more vendor sources: `static.ampcode.com/cli/cli-version.txt` and the `latest` tag of `@ampcode/cli` on npm give the same version. npm listed several builds within one day, so the number moves quickly.
