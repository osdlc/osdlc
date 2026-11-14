---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/marketplace
  object:
    supported: false
    git_subpath: true
    note: plugins are npm or git packages, or local directories, named in the plugins array; the opencode plugin group has list, add, check, update and remove
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugin command group source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20command%20group%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin add command source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20add%20command%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugin command group in source (lines 282 to 328) has list, add, check, update and remove, and add takes an npm registry or Git package specifier. A listing that lacks an option is evidence of absence, one step below its kind.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugins docs install sources v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20install%20sources%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs git refs v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20git%20refs%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The plugins page names npm and git package specs as what can be installed, with a ::path: selector for a repository subdirectory."
reportedIn:
  - "[OpenCode source commands commands.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20commands%20commands.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source plugins at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20plugins%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Marketplace](../../subjects/plugins/Marketplace.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

No source names a marketplace or catalog file. Plugins come from npm, git or a local directory.
