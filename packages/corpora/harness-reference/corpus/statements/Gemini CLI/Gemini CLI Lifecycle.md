---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: meta/lifecycle
  object:
    status: sunsetting
    successor: antigravity
    note: sign-in fails with IneligibleTierError for Gemini Code Assist for individuals, pointing at Antigravity; an API key was not tried
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Gemini CLI Lifecycle](../../study-results/Gemini%20CLI/2026-08-08%20Gemini%20CLI%20Lifecycle.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08; its value differs from the latest.
  - hasEvidenceItems:
      - "[2026-10-09 Gemini CLI Lifecycle](../../study-results/Gemini%20CLI/2026-10-09%20Gemini%20CLI%20Lifecycle.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: run observed 2026-10-09.
  - hasEvidenceItems:
      - "[2026-11-09 README on enterprise maintenance](../../study-results/Gemini%20CLI/2026-11-09%20README%20on%20enterprise%20maintenance.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: moderate
    description: "README: the CLI stays maintained for enterprise Code Assist, so it is not sunsetting."
  - hasEvidenceItems:
      - "[2026-11-09 Changelog latest stable release](../../study-results/Gemini%20CLI/2026-11-09%20Changelog%20latest%20stable%20release.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: moderate
    description: a stable release (v0.65.0) followed the 2026-06-18 move.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[gemini harness notes for a dispatcher](../../documents/skillwright/gemini%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-09T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: disputed
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Lifecycle](../../subjects/meta/Lifecycle.md)"
scope:
  since: null
  until: 0.65.0
  platform: []
  model: null
status: disputed
imported_from: fact:meta/lifecycle@gemini-cli#scope-[null,null,null]
---

Imported from `facts/gemini-cli/meta/lifecycle.md`.

The observations disagree on: note. The latest value is kept.

Research note, 2026-11-09: the sunsetting reading was observed on 2026-10-09, after the 2026-06-18 move, so it was never an accurate reading of the whole harness. It came from one individual-account sign-in failure (IneligibleTierError). The README and changelog show the project continues for enterprise Gemini Code Assist workflows. See the Lifecycle 2 statement.
