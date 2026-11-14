---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skill-frontmatter/description
  object:
    supported: true
    required: true
    note: A skill with a missing or empty description is not loaded. The parser sets no length limit; a test keeps a 1,025-character description whole.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill frontmatter name and description checks source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20name%20and%20description%20checks%20source.md)"
      - "[2026-11-14 Codex CLI Skill frontmatter description required test](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20description%20required%20test.md)"
      - "[2026-11-14 Codex CLI Skill frontmatter long description test](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20long%20description%20test.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.2.
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill frontmatter required fields docs](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20required%20fields%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-14.
reportedIn:
  - "[openai codex skills src parser.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser.rs%20at%20ce21072.md)"
  - "[openai codex skills src parser_tests.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser_tests.rs%20at%20ce21072.md)"
  - "[Codex docs build skills (redirect target of developers.openai.com codex skills)](../../documents/learn.chatgpt.com/Codex%20docs%20build%20skills%20%28redirect%20target%20of%20developers.openai.com%20codex%20skills%29.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[description](../../subjects/skill-frontmatter/description.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The parser returns `missing field description` when the description is empty after whitespace is collapsed. It checks no length. The startup skills list has its own budget, recorded under Skills in context at startup.
