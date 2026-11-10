---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/project-dirs
  object:
    dirs:
      - .codex/skills
      - .agents/skills
    scope: each ancestor of the working directory
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-08-08 Codex CLI Project skill directories](../../study-results/Codex%20CLI/2026-08-08%20Codex%20CLI%20Project%20skill%20directories.md)"
    directionOfEvidenceProvided: disputes
    strengthOfEvidenceProvided: weak
    description: third-party observed 2026-08-08; its value differs from the latest.
  - hasEvidenceItems:
      - "[2026-10-01 Codex CLI Project skill directories](../../study-results/Codex%20CLI/2026-10-01%20Codex%20CLI%20Project%20skill%20directories.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-01.
reportedIn:
  - "[Harness comparison](../../documents/skillwright/Harness%20comparison.md)"
  - "[Codex README](../../documents/OpenAI/Codex%20README.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Project skill directories](../../subjects/skills/Project%20skill%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: disputed
imported_from: fact:skills/project-dirs@codex#scope-[null,null,null]
---

Imported from `facts/codex/skills/project-dirs.md`.

The observations disagree on: dirs. The latest value is kept.
