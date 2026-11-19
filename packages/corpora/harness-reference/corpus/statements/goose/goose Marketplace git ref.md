---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: plugins/marketplace-git-ref
  object:
    supported: false
    basis: omitted-from-help
    note: goose plugin install takes a URL and --auto-update only, and clones with git clone --depth 1 <URL>, so it gets the default branch.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli plugin commands](../../study-results/goose/2026-11-14%20goose%20cli%20plugin%20commands.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The install command has no ref argument.
  - hasEvidenceItems:
      - "[2026-11-14 goose plugins git clone](../../study-results/goose/2026-11-14%20goose%20plugins%20git%20clone.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The clone passes no branch, tag or commit.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose plugins mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20plugins%20mod.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`goose plugin install` has no way to name a branch, tag or commit.
