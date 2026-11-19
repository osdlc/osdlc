---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/startup-context
  object:
    listed: name, description and file path of each skill
    budget: 2% of the context window; 8,000 characters when the window is unknown; raise with skills.max_context_tokens up to 10,000 tokens
    over_budget: descriptions are shortened first; some skills may be omitted with a warning
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI Skills in context at startup](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20Skills%20in%20context%20at%20startup.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI Skills in context at startup 2](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20Skills%20in%20context%20at%20startup%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Codex docs build skills (redirect target of developers.openai.com codex skills)](../../documents/learn.chatgpt.com/Codex%20docs%20build%20skills%20%28redirect%20target%20of%20developers.openai.com%20codex%20skills%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Skills in context at startup](../../subjects/skills/Skills%20in%20context%20at%20startup.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/startup-context@codex#scope-[null,null,null]
---

Imported from `facts/codex/skills/startup-context.md`.
