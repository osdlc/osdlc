---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: instructions/files
  object:
    files:
      - AGENTS.override.md
      - AGENTS.md
      - project_doc_fallback_filenames entries
    walk: from the project root (marker .git) down to the working directory, at most one file per directory; plus the Codex home directory
    budget: project_doc_max_bytes, 32 KiB by default
    not_read: filenames not listed in project_doc_fallback_filenames
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Instruction files read source](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Instruction%20files%20read%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Instruction files read walk](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Instruction%20files%20read%20walk.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Instruction files read budget](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Instruction%20files%20read%20budget.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Instruction files read global](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Instruction%20files%20read%20global.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Instruction files read one per directory](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Instruction%20files%20read%20one%20per%20directory.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Instruction files read fallback](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Instruction%20files%20read%20fallback.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09 at 0.162.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Instruction files read](../../subjects/instructions/Instruction%20files%20read.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Codex CLI Instruction files read](Codex%20CLI%20Instruction%20files%20read.md)"
---

The older statement named only AGENTS.md. At 0.162.0 AGENTS.override.md is checked first in each directory, and fallback names are configurable.
