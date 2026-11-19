---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: meta/version-seen
  object:
    version: 1.0.45
    context: newest version in the public repository at 2bdd1d6 (changelog entry dated 2026-09-29); the repository had no later commit on 2026-11-14
    observed: 2026-11-14
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok pager crate version 1.0.45](../../study-results/Grok%20Build/2026-11-14%20grok%20pager%20crate%20version%201.0.45.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The xai-grok-pager crate at 2bdd1d6 sets version 1.0.45.
  - hasEvidenceItems:
      - "[2026-11-14 grok changelog 1.0.45 first heading](../../study-results/Grok%20Build/2026-11-14%20grok%20changelog%201.0.45%20first%20heading.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The first entry of the changelog at 2bdd1d6 is 1.0.45, dated 2026-09-29.
reportedIn:
  - "[xai-org grok-build pager Cargo.toml at 2bdd1d6](../../documents/github.com/xai-org%20grok-build%20pager%20Cargo.toml%20at%202bdd1d6.md)"
  - "[xai-org grok-build shell CHANGELOG at 2bdd1d6](../../documents/github.com/xai-org%20grok-build%20shell%20CHANGELOG%20at%202bdd1d6.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Version seen](../../subjects/meta/Version%20seen.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Grok Build Version seen 1.0.0](Grok%20Build%20Version%20seen%201.0.0.md)"
open:
  - Is a build newer than 1.0.45 distributed? The public repository is a sync from an internal monorepo and stood at 2bdd1d6 (2026-09-29) on 2026-11-14.
---

The public repository carries version 1.0.45 in its crates and its changelog, with one changelog file per version. The repository has no GitHub releases and had no commit after 2026-09-29, so a newer build may exist that the repository does not show. The 2026-08-08 statement recorded 1.0.0 from a third-party note.
