---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: plugins/marketplace-git-ref
  object:
    supported: true
    ref_syntax: owner/repo#ref
    kinds:
      - branch
      - tag
      - commit
    argv:
      - plugin
      - marketplace
      - add
      - "{source}#{ref}"
    subpath: OWNER/REPO:PATH/TO/PLUGIN on `copilot plugin install`
    note: branch and tag are named in the 1.0.112 changelog; a commit is pinned by the `sha` field of a plugin source in marketplace.json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Marketplace add source docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Marketplace%20add%20source%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Plugin source sha docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20source%20sha%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Plugin install subdirectory docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Plugin%20install%20subdirectory%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugin reference gives the ref syntax, the sha field and the subdirectory form.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Marketplace branch or tag changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Marketplace%20branch%20or%20tag%20changelog.md)"
      - "[2026-11-14 GitHub Copilot CLI Marketplace ref syntax changelog](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Marketplace%20ref%20syntax%20changelog.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The changelog names the ref syntax and the ref kinds.
reportedIn:
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
  - "[GitHub Copilot CLI changelog.md at 16604af](../../documents/GitHub/GitHub%20Copilot%20CLI%20changelog.md%20at%2016604af.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A marketplace is added at a ref with `owner/repo#ref`. A commit is not shown in that syntax: the docs pin a commit with the 40-character `sha` field of a plugin source in `marketplace.json`.
