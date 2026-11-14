---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: meta/source-license
  object:
    open_source: false
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 repository README terms](../../study-results/Antigravity/2026-11-14%20repository%20README%20terms.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: The public antigravity-cli repository holds a README, a changelog and example scripts, with no source code and no LICENSE file; its README places use under the Google Terms of Service. A missing file is evidence by omission, so this is weak.
reportedIn:
  - "[Antigravity CLI repository README](../../documents/Google/Antigravity%20CLI%20repository%20README.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Source and licence](../../subjects/meta/Source%20and%20licence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Google publishes a GitHub repository for the CLI, but it holds only the README, the changelog, issue templates and example scripts. The separate Python SDK repository (`google-antigravity/antigravity-sdk-python`) does carry an Apache-2.0 license; it is a library, not the harness.
