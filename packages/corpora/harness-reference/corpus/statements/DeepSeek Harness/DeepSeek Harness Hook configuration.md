---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: hooks/config
  object:
    kind: bridge that runs an unmodified Claude Code hooks.json (a Codex bridge exists too)
    enabled_by_default: false
    config: a YAML row with configPath, pluginRoot, projectDir
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-10-08 DeepSeek Harness Hook configuration](../../study-results/DeepSeek%20Harness/2026-10-08%20DeepSeek%20Harness%20Hook%20configuration.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-10-08.
reportedIn:
  - "[DeepSeek Harness (dsh) harness notes for a dispatcher](../../documents/skillwright/DeepSeek%20Harness%20%28dsh%29%20harness%20notes%20for%20a%20dispatcher.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-08T00:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Hook configuration](../../subjects/hooks/Hook%20configuration.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - How the hooks bridge's payload and exit-code semantics compare with Claude Code's, field by field.
imported_from: fact:hooks/config@dsh#scope-[null,null,null]
---

Imported from `facts/dsh/hooks/config.md`.

Open questions:
- How the hooks bridge's payload and exit-code semantics compare with Claude Code's, field by field.
