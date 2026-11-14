---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: skills/project-trust
  object:
    supported: false
    detail: project skill folders are searched whenever a working directory is given; skill discovery has no trust check
    basis: undocumented
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose skill project dirs unconditional](../../study-results/goose/2026-11-14%20goose%20skill%20project%20dirs%20unconditional.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The project skill folders are added to the search list with no condition but the working directory.
reportedIn:
  - "[aaif-goose goose skills mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20skills%20mod.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Project skills and folder trust](../../subjects/skills/Project%20skills%20and%20folder%20trust.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[goose Project skills and folder trust open](goose%20Project%20skills%20and%20folder%20trust%20open.md)"
---

goose has no folder trust step for skills: the project skill folders are always searched. A search of the source and the docs for a folder trust setting found none.
