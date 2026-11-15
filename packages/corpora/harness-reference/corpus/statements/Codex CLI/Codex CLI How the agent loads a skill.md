---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/agent-loading
  object:
    mechanism: reads the advertised skill file
    body_at_startup: false
    body_on: when Codex decides to use the skill (task matches description) or the user invokes it with $ or /skills
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-01 Codex CLI How the agent loads a skill](../../study-results/Codex%20CLI/2026-10-01%20Codex%20CLI%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-01.
  - hasEvidenceItems:
      - "[2026-11-04 Codex CLI How the agent loads a skill](../../study-results/Codex%20CLI/2026-11-04%20Codex%20CLI%20How%20the%20agent%20loads%20a%20skill.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-04.
reportedIn:
  - "[Codex README](../../documents/OpenAI/Codex%20README.md)"
  - "[Codex docs build skills (redirect target of developers.openai.com codex skills)](../../documents/learn.chatgpt.com/Codex%20docs%20build%20skills%20%28redirect%20target%20of%20developers.openai.com%20codex%20skills%29.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[How the agent loads a skill](../../subjects/skills/How%20the%20agent%20loads%20a%20skill.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:skills/agent-loading@codex#scope-[null,null,null]
---

Imported from `facts/codex/skills/agent-loading.md`.
