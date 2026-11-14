---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/context-dirs
  object:
    supported: false
    basis: omitted-from-help
    note: No option in the CLI argument definitions adds a directory to a run; --cwd sets the one working directory. The Claude-compatible permissions.additionalDirectories setting is parsed but not supported.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli argument list](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20argument%20list.md)"
      - "[2026-11-14 grok cli cwd flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20cwd%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The argument definitions were read in full and hold no option that adds a directory. A listing can leave an option out, so this counts one step below source.
  - hasEvidenceItems:
      - "[2026-11-14 grok additionalDirectories unsupported](../../study-results/Grok%20Build/2026-11-14%20grok%20additionalDirectories%20unsupported.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The permissions guide says the Claude-compatible setting is not supported.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Permissions and safety](../../documents/github.com/Grok%20Build%20user%20guide%20Permissions%20and%20safety.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Extra context directories](../../subjects/cli/Extra%20context%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

This is an answer from absence: the source lists no flag, and the one related setting is documented as unsupported.
