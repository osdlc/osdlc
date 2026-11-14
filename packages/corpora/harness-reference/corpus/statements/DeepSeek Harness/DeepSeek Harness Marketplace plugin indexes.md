---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: plugins/marketplace
  object:
    supported: true
    file: "a plugin index: one UTF-8 JSON file at any URL the user adds as an index source (the guide's example is index.json)"
    install_id: the npm package name of a listed plugin, at a listed version
    git_subpath: true
    note: "Experimental: the Custom plugin indexes bundle must be switched on, which adds a Discover tab to the Plugins page. DSH ships no index source; the user adds index URLs per profile."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh plugin index summary](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20index%20summary.md)"
      - "[2026-11-14 dsh plugin index add index source](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20index%20add%20index%20source.md)"
      - "[2026-11-14 dsh plugin index file and hosting](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20index%20file%20and%20hosting.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugin indexes guide at 39163dd describes index files, the Discover tab, adding an index source and installing a listed version.
  - hasEvidenceItems:
      - "[2026-11-14 dsh index git source fields](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20index%20git%20source%20fields.md)"
      - "[2026-11-14 dsh git version install spec](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20git%20version%20install%20spec.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: A version entry may have a git source with a path, installed as a package in a subdirectory.
reportedIn:
  - "[deepseek-ai deepseek-harness plugin-market guide at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20plugin-market%20guide%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Marketplace](../../subjects/plugins/Marketplace.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[DeepSeek Harness Marketplace](DeepSeek%20Harness%20Marketplace.md)"
open:
  - From which DSH version are plugin indexes available? The guide gives none.
---

The 2026-10-08 statement said DSH has no marketplace. The user guide on main (39163dd, version 0.2.2-rc.3) describes plugin indexes: a JSON file that lists installable bundles, browsed in a Discover tab and installed after a confirmation. The feature is an experimental bundle that is off by default, and the guide gives no version in which it arrived, so the scope is not limited.
