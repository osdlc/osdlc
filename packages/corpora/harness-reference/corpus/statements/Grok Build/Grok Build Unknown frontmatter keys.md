---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: skill-frontmatter/unknown-keys
  object:
    behavior: "ignored: the frontmatter is read into an untyped map and only the known keys are looked up"
    known_keys:
      - name
      - description
      - when-to-use
      - when_to_use
      - paths
      - metadata
      - license
      - compatibility
      - argument-hint
      - allowed-tools
      - model
      - effort
      - user-invocable
      - disable-model-invocation
      - origin
    invalid_invocation_value: a value other than true or the string "true" reads as false
    invalid_name_or_no_frontmatter: an invalid name falls back to the directory name, and the skill is skipped with a warning only when that is invalid too; with no frontmatter the directory name is used
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok skill untyped frontmatter](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20untyped%20frontmatter.md)"
      - "[2026-11-14 grok skill frontmatter map](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20frontmatter%20map.md)"
      - "[2026-11-14 grok skill frontmatter keys](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20frontmatter%20keys.md)"
      - "[2026-11-14 grok skill frontmatter keys 2](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20frontmatter%20keys%202.md)"
      - "[2026-11-14 grok skill frontmatter keys 3](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20frontmatter%20keys%203.md)"
      - "[2026-11-14 grok skill frontmatter keys 4](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20frontmatter%20keys%204.md)"
      - "[2026-11-14 grok skill invocation defaults](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20invocation%20defaults.md)"
      - "[2026-11-14 grok skill boolean parse](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20boolean%20parse.md)"
      - "[2026-11-14 grok skill name fallback](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20name%20fallback.md)"
      - "[2026-11-14 grok skill invalid name dropped](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20invalid%20name%20dropped.md)"
      - "[2026-11-14 grok skill no frontmatter](../../study-results/Grok%20Build/2026-11-14%20grok%20skill%20no%20frontmatter.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The frontmatter parser: an untyped map, per-key lookups, the boolean rule and the name fallback."
reportedIn:
  - "[xai-org grok-build skills discovery.rs](../../documents/github.com/xai-org%20grok-build%20skills%20discovery.rs.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Unknown frontmatter keys](../../subjects/skill-frontmatter/Unknown%20frontmatter%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Grok Build Unknown frontmatter keys open](Grok%20Build%20Unknown%20frontmatter%20keys%20open.md)"
---

Read from the parser source. No run was made.
