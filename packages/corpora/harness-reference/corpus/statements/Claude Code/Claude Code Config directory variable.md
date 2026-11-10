---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: config/config-dir-env
  object:
    supported: true
    var: CLAUDE_CONFIG_DIR
    replaces: ~/.claude
    sets:
      - settings
      - sessions
      - plugins
    note: The same applies to .claude.json, which otherwise sits at ~/.claude.json.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 docs env CONFIG_DIR](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20CONFIG_DIR.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The variable overrides the configuration directory; settings, session history and plugins live under it.
  - hasEvidenceItems:
      - "[2026-11-09 docs claude-directory config dir](../../study-results/Claude%20Code/2026-11-09%20docs%20claude-directory%20config%20dir.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Every ~/.claude path, and .claude.json, lives under the directory when it is set.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Config directory variable](../../subjects/config/Config%20directory%20variable.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does CLAUDE_CONFIG_DIR leave anything read from the home directory, and is it ignored in project and local settings? Neither is in a quoted excerpt
---
