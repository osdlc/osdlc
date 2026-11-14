---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: instructions/files
  object:
    files:
      - GEMINI.md
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Gemini CLI Instruction files read](../../study-results/Gemini%20CLI/2026-08-08%20Gemini%20CLI%20Instruction%20files%20read.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08.
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI default context file name source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20default%20context%20file%20name%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: memoryTool.ts at v0.68.0 sets DEFAULT_CONTEXT_FILENAME to GEMINI.md.
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI context file name setting docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20context%20file%20name%20setting%20docs.md)"
      - "[2026-11-14 Gemini CLI context file name example docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20context%20file%20name%20example%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs at v0.68.0 say GEMINI.md is the default file name and context.fileName can name others.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[google-gemini gemini-cli core src tools memoryTool.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20tools%20memoryTool.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs cli gemini-md.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20gemini-md.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-08-08T00:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-14T18:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Instruction files read](../../subjects/instructions/Instruction%20files%20read.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:instructions/files@gemini-cli#scope-[null,null,null]
---

Imported from `facts/gemini-cli/instructions/files.md`.

Checked against the source and docs at v0.68.0 on 2026-11-14: GEMINI.md is the default. The `context.fileName` setting can replace it or list more names.
