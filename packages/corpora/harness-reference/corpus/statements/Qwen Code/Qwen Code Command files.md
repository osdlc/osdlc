---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: commands/files
  object:
    supported: true
    note: Markdown files with optional YAML frontmatter under `~/.qwen/commands` and `.qwen/commands`; TOML files are deprecated but still read
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Custom commands format docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Custom%20commands%20format%20docs.md)"
      - "[2026-11-14 Qwen Code Custom command paths docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Custom%20command%20paths%20docs.md)"
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
subject: "[Command files](../../subjects/commands/Command%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Custom commands are files. `~/.qwen/commands/test.md` becomes `/test`. The format moved from TOML to Markdown.
