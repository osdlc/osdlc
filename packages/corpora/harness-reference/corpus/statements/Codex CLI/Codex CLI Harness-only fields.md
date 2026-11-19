---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: skill-frontmatter/extensions
  object:
    fields: []
    metadata_keys:
      - short-description
    sidecar: agents/openai.yaml
    sidecar_keys:
      - interface
      - dependencies
      - policy
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill frontmatter struct source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20struct%20source.md)"
      - "[2026-11-14 Codex CLI Skill frontmatter metadata struct source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20frontmatter%20metadata%20struct%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "source at rust-v0.167.2: the frontmatter struct has no field beyond name, description and metadata. A listing is evidence of absence, one step below its kind."
  - hasEvidenceItems:
      - "[2026-11-14 Codex CLI Skill sidecar file name source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20sidecar%20file%20name%20source.md)"
      - "[2026-11-14 Codex CLI Skill sidecar keys source](../../study-results/Codex%20CLI/2026-11-14%20Codex%20CLI%20Skill%20sidecar%20keys%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at rust-v0.167.2: Codex-only settings are read from the sidecar file."
reportedIn:
  - "[openai codex skills src parser.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20parser.rs%20at%20ce21072.md)"
  - "[openai codex skills src metadata.rs at ce21072](../../documents/github.com/openai%20codex%20skills%20src%20metadata.rs%20at%20ce21072.md)"
  - "[openai codex ext skills src loader mod.rs at ce21072](../../documents/github.com/openai%20codex%20ext%20skills%20src%20loader%20mod.rs%20at%20ce21072.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Harness-only fields](../../subjects/skill-frontmatter/Harness-only%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Codex adds no top-level frontmatter field. It reads one key of its own inside the spec's `metadata` map, `short-description`, and keeps its other settings in `agents/openai.yaml` beside SKILL.md.
