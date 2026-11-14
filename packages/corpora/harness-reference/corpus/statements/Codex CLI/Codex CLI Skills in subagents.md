---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/subagent-visibility
  object:
    supported: "true"
    disable_with: skills.config entries in the custom agent file; skills.bundled.enabled = false for bundled skills
    setting: skills.include_instructions = false omits the skills instructions block
    note: The skills instructions tell the main agent to read skill files itself and not to hand that to a subagent.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skills in subagents docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skills%20in%20subagents%20docs.md)"
      - "[2026-11-14 Codex CLI Skills in subagents controls docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skills%20in%20subagents%20controls%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-14.
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skills in subagents source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skills%20in%20subagents%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at rust-v0.167.2: the instruction text about delegating skill reading."
reportedIn:
  - "[Codex docs subagents](../../documents/learn.chatgpt.com/Codex%20docs%20subagents.md)"
  - "[openai codex ext skills src catalog_prompt.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20catalog_prompt.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Skills in subagents](../../subjects/skills/Skills%20in%20subagents.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The docs say skills inherit from the parent. The statement is moderate because that sentence is from the docs; the source line supports only the note.
