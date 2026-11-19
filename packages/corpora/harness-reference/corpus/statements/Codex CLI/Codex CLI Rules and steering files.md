---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: instructions/rules
  object:
    supported: false
    note: "Guidance is scoped by directory: one AGENTS.override.md or AGENTS.md per directory from the project root to the working directory. The .rules files under a rules folder are command approval rules, not instructions."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Instruction file names source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Instruction%20file%20names%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at rust-v0.167.2: the instruction loader reads only the candidate names in each directory. A listing is evidence of absence, one step below its kind."
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Reads AGENTS.md docs](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Reads%20AGENTS.md%20docs.md)"
      - "[2026-11-14 Codex CLI Rules files docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Rules%20files%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: "docs: the discovery walk, and what a .rules file is for."
reportedIn:
  - "[openai codex core src agents_md.rs at ce21072](../../documents/github.com/openai%20codex%20core%20src%20agents_md.rs%20at%20ce21072.md)"
  - "[Codex docs AGENTS.md](../../documents/learn.chatgpt.com/Codex%20docs%20AGENTS.md.md)"
  - "[Codex docs rules](../../documents/learn.chatgpt.com/Codex%20docs%20rules.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Rules and steering files](../../subjects/instructions/Rules%20and%20steering%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Codex has a feature named rules, but it controls which commands run outside the sandbox. It is not a scoped instruction file.
