---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skills/name-validation
  object:
    checks: the parser checks the frontmatter `name` length (`MAX_NAME_LEN`) and rejects an empty `description` (missing field)
    length: at most 64 characters, counted on `name` before any plugin prefix
    blocking: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI skill parser name length limit source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20skill%20parser%20name%20length%20limit%20source.md)"
      - "[2026-11-14 Codex CLI skill parser name and description checks source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20skill%20parser%20name%20and%20description%20checks%20source.md)"
      - "[2026-11-14 Codex CLI skill parser default name source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20skill%20parser%20default%20name%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "parser.rs at rust-v0.169.0: MAX_NAME_LEN is 64, validate_len runs on the parsed name, and an empty description returns MissingField."
reportedIn:
  - "[Codex source skills parser.rs at rust-v0.169.0](../../documents/github.com/Codex%20source%20skills%20parser.rs%20at%20rust-v0.169.0.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Codex CLI Skill name validation](Codex%20CLI%20Skill%20name%20validation.md)"
open:
  - Is there still a length limit on the plugin-qualified name? parser.rs at rust-v0.169.0 defines no MAX_QUALIFIED_NAME_LEN; the loader was not read.
---

The 2026-10-01 statement said the only check was length. The parser at rust-v0.169.0 also rejects a skill whose `description` is empty or missing. The 64-character limit is checked on the frontmatter `name` (or the default name when `name` is empty) inside the frontmatter parser, where no plugin prefix exists yet. The older statement also named `MAX_QUALIFIED_NAME_LEN` after prefixing; this file no longer holds it.
