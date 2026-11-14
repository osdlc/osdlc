---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: instructions/rules
  object:
    supported: true
    dir: any directory of the project, as a nested .goosehints or AGENTS.md
    attach_by: loaded when goose reads or modifies files in that directory
    note: "No separate rules folder and no frontmatter: the scoped files are nested copies of the context files."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose docs nested hints load](../../study-results/goose/2026-11-14%20goose%20docs%20nested%20hints%20load.md)"
      - "[2026-11-14 goose docs nested hints file names](../../study-results/goose/2026-11-14%20goose%20docs%20nested%20hints%20file%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The hints guide says nested hint files load when goose works in their directory.
reportedIn:
  - "[aaif-goose goose using-goosehints.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20using-goosehints.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Rules and steering files](../../subjects/instructions/Rules%20and%20steering%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

goose has no rules folder. Its scoped instructions are nested hint files, loaded when goose touches files in their directory.
