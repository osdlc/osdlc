---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/body-size
  object:
    cap: 8,000 bytes for a SKILL.md that Codex injects after an explicit mention; past it the text is cut and a warning is shown
    applies_to: every skill in the skills extension path; only Agent Plugins skills in the core host path
    detail: The docs state no body limit and say Codex reads the full SKILL.md. The skills instructions tell the model to read SKILL.md completely.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill body size cap source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20body%20size%20cap%20source.md)"
      - "[2026-11-14 Codex CLI Skill body size extension path source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20body%20size%20extension%20path%20source.md)"
      - "[2026-11-14 Codex CLI Skill body size core path source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20body%20size%20core%20path%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.2.
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill body size docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20body%20size%20docs.md)"
      - "[2026-11-14 Codex CLI Skill read completely source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20read%20completely%20source.md)"
    directionOfEvidenceProvided: neutral
    description: The docs and the instruction text describe the model reading the whole file; they state no limit.
reportedIn:
  - "[openai codex ext skills src render.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20render.rs%20at%20ce21072.md)"
  - "[openai codex ext skills src extension.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20extension.rs%20at%20ce21072.md)"
  - "[openai codex ext skills src host_prompt.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_prompt.rs%20at%20ce21072.md)"
  - "[Codex docs build skills (redirect target of developers.openai.com codex skills)](../../documents/learn.chatgpt.com/Codex%20docs%20build%20skills%20%28redirect%20target%20of%20developers.openai.com%20codex%20skills%29.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Skill body size](../../subjects/skills/Skill%20body%20size.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which of the two paths injects a mentioned skill in the released CLI, and so whether a plain local SKILL.md over 8,000 bytes is cut, was not run.
---

The cap is on text Codex injects itself. A skill the model opens with its own file tools is not covered by this code. The strength is lowered to moderate because the two code paths differ and no run settled which one applies.
