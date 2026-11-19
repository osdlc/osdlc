---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: instructions/claude-md
  object:
    supported: false
    note: The names tried are AGENTS.override.md and AGENTS.md. CLAUDE.md is read only when it is listed in project_doc_fallback_filenames.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Instruction file names source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Instruction%20file%20names%20source.md)"
      - "[2026-11-14 Codex CLI Instruction default file name source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Instruction%20default%20file%20name%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at rust-v0.167.2: the candidate names are two constants and the configured fallback list. A listing is evidence of absence, one step below its kind."
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Reads AGENTS.md docs](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Reads%20AGENTS.md%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: "docs observed 2026-11-09: the same list of names, with no CLAUDE.md."
reportedIn:
  - "[openai codex core src agents_md.rs at ce21072](../../documents/github.com/openai%20codex%20core%20src%20agents_md.rs%20at%20ce21072.md)"
  - "[Codex docs AGENTS.md](../../documents/learn.chatgpt.com/Codex%20docs%20AGENTS.md.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Reads CLAUDE.md](../../subjects/instructions/Reads%20CLAUDE.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

No source says in words that CLAUDE.md is not read. The answer rests on the list of names Codex tries in each directory.
