---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: plugins/marketplace-git-ref
  object:
    supported: true
    kinds:
      - branch
      - tag
      - commit
    ref_syntax: "git+<url>.git#<commit>"
    subpath: "&path:/<path> after the ref"
    argv:
      - dsh
      - plugin
      - "--profile"
      - "<name>"
      - add
      - "<package-or-git-spec>"
    note: "A plugin index entry of type git pins a 40-hex commit. A Git spec saved with a branch, a tag or a range is not updatable."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh plugin add package or git spec](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20add%20package%20or%20git%20spec.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The CLI reference says dsh plugin add takes a package or a git spec."
  - hasEvidenceItems:
      - "[2026-11-14 dsh index git source fields](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20index%20git%20source%20fields.md)"
      - "[2026-11-14 dsh git version install spec](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20git%20version%20install%20spec.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The plugin index guide gives the git source fields and the spec DSH installs."
  - hasEvidenceItems:
      - "[2026-11-14 dsh git spec update eligibility](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20git%20spec%20update%20eligibility.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The plugin-manager README names Git specs saved with a commit, a branch, a tag or a range."
reportedIn:
  - "[deepseek-ai deepseek-harness apps cli reference README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20apps%20cli%20reference%20README%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness plugin-market guide at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20plugin-market%20guide%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness plugin-manager README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20plugin-manager%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
