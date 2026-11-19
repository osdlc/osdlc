---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/marketplace-git-ref
  object:
    supported: true
    ref_syntax: <git package spec>#<ref>, such as github:acme/opencode-plugin#main
    kinds:
      - branch
      - tag
      - commit
    argv:
      - plugin
      - add
      - "{source}#{ref}"
    subpath: "#<ref>::path:<dir>"
    note: there is no marketplace; the ref is part of the plugin's git package spec, and a commit must be a complete hash
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugins docs git refs v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20git%20refs%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs git examples v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20git%20examples%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The plugins page says branches, tags and complete commit hashes are supported and shows the #ref and ::path: forms."
reportedIn:
  - "[OpenCode docs source plugins at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20plugins%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

From the plugins docs page at v2.3.0.
