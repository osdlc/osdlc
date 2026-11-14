---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/arguments
  object:
    supported: partial
    mechanism: the typed text stays in the user message; SKILL.md is added beside it, unchanged, in a <skill> block with the skill name and path
    placeholders: []
    note: No placeholder is filled in. Plugin command migration skips a command whose text uses $ARGUMENTS or a numbered placeholder.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill injection source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20injection%20source.md)"
      - "[2026-11-14 Codex CLI Skill fragment body source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20fragment%20body%20source.md)"
      - "[2026-11-14 Codex CLI Skill mention scan source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20mention%20scan%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at rust-v0.167.2: how a mentioned skill reaches the model."
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill arguments command migration source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20arguments%20command%20migration%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at rust-v0.167.2: $ARGUMENTS is named an unsupported template feature. The injection code has no substitution step, which is evidence of absence."
reportedIn:
  - "[openai codex ext skills src host_prompt.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20host_prompt.rs%20at%20ce21072.md)"
  - "[openai codex ext skills src fragments.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20fragments.rs%20at%20ce21072.md)"
  - "[openai codex core-plugins src command_migration.rs at ce21072](../../documents/github.com/openai%20codex%20core-plugins%20src%20command_migration.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Skill arguments](../../subjects/skills/Skill%20arguments.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Codex CLI Skill arguments open](Codex%20CLI%20Skill%20arguments%20open.md)"
---

A `$skill-name` mention selects the skill; the rest of the message is the request the model reads next to the skill text. The statement is moderate because "no placeholder" rests on the code having no substitution step.
