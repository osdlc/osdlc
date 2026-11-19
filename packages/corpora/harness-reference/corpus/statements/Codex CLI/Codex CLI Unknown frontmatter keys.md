---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skill-frontmatter/unknown-keys
  object:
    behavior: ignored
    known_keys:
      - name
      - description
      - metadata.short-description
    invalid_name_or_no_frontmatter: "the skill is not loaded and an error is recorded: no frontmatter, invalid YAML, a name over 64 characters or no description"
    note: A line whose unquoted value breaks YAML is quoted and parsed again, so a key such as argument-hint does not fail the skill.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill frontmatter struct source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20struct%20source.md)"
      - "[2026-11-14 Codex CLI Skill frontmatter unknown keys test](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20unknown%20keys%20test.md)"
      - "[2026-11-14 Codex CLI Skill load errors source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20load%20errors%20source.md)"
      - "[2026-11-14 Codex CLI Skill frontmatter name and description checks source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20name%20and%20description%20checks%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source at rust-v0.167.2.
reportedIn:
  - "[openai codex skills src parser.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser.rs%20at%20ce21072.md)"
  - "[openai codex skills src parser_tests.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser_tests.rs%20at%20ce21072.md)"
  - "[openai codex ext skills src loader host.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20loader%20host.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Unknown frontmatter keys](../../subjects/skill-frontmatter/Unknown%20frontmatter%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Codex CLI Unknown frontmatter keys open](Codex%20CLI%20Unknown%20frontmatter%20keys%20open.md)"
---

The frontmatter struct does not refuse unknown fields, and the test `repairs_unrecognized_frontmatter_fields_that_need_quotes` parses a skill that carries `argument-hint` and `tags`. Load errors are kept for every root except the bundled system skills.
