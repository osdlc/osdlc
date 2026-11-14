---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: instructions/rules
  object:
    supported: true
    dir: .qwen/rules
    attach_by: "`paths:` frontmatter globs: the rule is injected once a tool call reads or edits a matching file; a rule without `paths:` is always in the prompt"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Rules directory docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Rules%20directory%20docs.md)"
      - "[2026-11-14 Qwen Code Conditional rules docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Conditional%20rules%20docs.md)"
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
subject: "[Rules and steering files](../../subjects/instructions/Rules%20and%20steering%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Rules are Markdown files in `.qwen/rules`. A rule with `paths:` is conditional; one without is a baseline rule.
