---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skill-frontmatter/license
  object:
    supported: false
    note: Not read. The parser keeps name, description and metadata.short-description; any other key is dropped.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill frontmatter struct source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20struct%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at rust-v0.167.2: the parser lists every frontmatter key it keeps, and this key is not among them. A listing is evidence of absence, one step below its kind."
reportedIn:
  - "[openai codex skills src parser.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[license](../../subjects/skill-frontmatter/license.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Codex 0.167.2 parses SKILL.md frontmatter into a struct with three fields: `name`, `description` and `metadata`. `license` is not one of them, so Codex ignores it. No source says the field is unsupported in words; the answer rests on the struct.
