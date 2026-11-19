---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: instructions/claude-md
  object:
    supported: false
    role: not read by default; read when CONTEXT_FILE_NAMES lists it
    basis: documented
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose hints default file names](../../study-results/goose/2026-11-14%20goose%20hints%20default%20file%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The default context file names are .goosehints and AGENTS.md.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs CONTEXT_FILE_NAMES default](../../study-results/goose/2026-11-14%20goose%20docs%20CONTEXT_FILE_NAMES%20default.md)"
      - "[2026-11-14 goose docs CLAUDE.md through CONTEXT_FILE_NAMES](../../study-results/goose/2026-11-14%20goose%20docs%20CLAUDE.md%20through%20CONTEXT_FILE_NAMES.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The hints guide gives the default list and names CLAUDE.md as a file to add through CONTEXT_FILE_NAMES.
reportedIn:
  - "[aaif-goose goose load_hints.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20load_hints.rs%20at%202365bc5.md)"
  - "[aaif-goose goose using-goosehints.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20using-goosehints.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Reads CLAUDE.md](../../subjects/instructions/Reads%20CLAUDE.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

goose does not read `CLAUDE.md` by default. Setting `CONTEXT_FILE_NAMES` to a list that holds it makes goose read it.
