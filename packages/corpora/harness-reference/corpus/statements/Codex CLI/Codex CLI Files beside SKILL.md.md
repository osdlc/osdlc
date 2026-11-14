---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/bundled-files
  object:
    auto_loaded: false
    seen_on_load: the skill name, the SKILL.md path and the SKILL.md text
    guidance: the skills instructions tell the model to open only files SKILL.md links and not to load unrelated references, scripts or assets
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill injection source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20injection%20source.md)"
      - "[2026-11-14 Codex CLI Skill fragment body source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20fragment%20body%20source.md)"
      - "[2026-11-14 Codex CLI Files beside SKILL.md source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Files%20beside%20SKILL.md%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.2.
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Files beside SKILL.md docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Files%20beside%20SKILL.md%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-14.
reportedIn:
  - "[openai codex ext skills src host_prompt.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_prompt.rs%20at%20ce21072.md)"
  - "[openai codex ext skills src catalog_prompt.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20catalog_prompt.rs%20at%20ce21072.md)"
  - "[Codex docs build skills (redirect target of developers.openai.com codex skills)](../../documents/learn.chatgpt.com/Codex%20docs%20build%20skills%20%28redirect%20target%20of%20developers.openai.com%20codex%20skills%29.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Files beside SKILL.md](../../subjects/skills/Files%20beside%20SKILL.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

When a skill is selected, Codex puts only SKILL.md into the conversation, inside a `<skill>` block with the name and path. Other files are read by the model when SKILL.md points at them.
