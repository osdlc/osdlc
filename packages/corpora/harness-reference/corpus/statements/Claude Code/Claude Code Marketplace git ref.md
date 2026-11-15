---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: plugins/marketplace-git-ref
  object:
    supported: true
    ref_syntax: owner/repo#ref, or <clone url>#ref
    kinds:
      - branch
      - tag
    argv:
      - plugin
      - marketplace
      - add
      - "{source}#{ref}"
    note: The docs name branches and tags only.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 docs pinstall marketplace ref](../../study-results/Claude%20Code/2026-11-09%20docs%20pinstall%20marketplace%20ref.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "A GitHub owner/repo source takes #ref to pin a branch or tag."
  - hasEvidenceItems:
      - "[2026-11-09 docs pinstall git url ref](../../study-results/Claude%20Code/2026-11-09%20docs%20pinstall%20git%20url%20ref.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "A full clone URL takes #ref to pin a branch or tag."
  - hasEvidenceItems:
      - "[2026-11-09 help marketplace add](../../study-results/Claude%20Code/2026-11-09%20help%20marketplace%20add.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`claude plugin marketplace add` takes a URL, path or GitHub repo from the shell."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - "Is a commit SHA accepted after #? The docs name branch or tag only."
---
