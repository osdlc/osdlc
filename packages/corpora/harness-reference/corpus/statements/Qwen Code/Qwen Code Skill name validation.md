---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: skills/name-validation
  object:
    checks: non-empty and matches /^[\p{L}\p{N}_:.-]+$/u
    charset: Unicode letters and digits, `_`, `:`, `.`, `-`
    colon_allowed: true
    blocking: true
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill name pattern source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20name%20pattern%20source.md)"
      - "[2026-11-14 Qwen Code Skill name failure skips skill source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20name%20failure%20skips%20skill%20source.md)"
      - "[2026-11-14 Qwen Code Skill name required source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20name%20required%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the pattern, and a failed check skips the skill"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Skill name requirement docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Skill%20name%20requirement%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs at v0.27.3
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Skill name validation](../../subjects/skills/Skill%20name%20validation.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A name that fails the pattern is a parse error and the skill is skipped.
