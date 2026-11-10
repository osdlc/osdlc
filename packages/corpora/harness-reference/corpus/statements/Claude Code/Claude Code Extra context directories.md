---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/context-dirs
  object:
    supported: true
    argv:
      - --add-dir
      - "{dir}"
    config_key: permissions.additionalDirectories
    env:
      CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: 1 loads memory files from the added directories
    trusted: "grants file access, not configuration: most .claude configuration is not discovered from an added directory"
    note: The flag is variadic (--add-dir <directories...>), so several directories may follow one flag.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 help add-dir](../../study-results/Claude%20Code/2026-11-09%20help%20add-dir.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "Help text: --add-dir <directories...>."
  - hasEvidenceItems:
      - "[2026-11-09 docs cli add-dir](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20add-dir.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference describes file access and the permissions.additionalDirectories setting.
  - hasEvidenceItems:
      - "[2026-11-09 docs env ADDITIONAL_DIRS](../../study-results/Claude%20Code/2026-11-09%20docs%20env%20ADDITIONAL_DIRS.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: An env var turns on memory file loading from added directories.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Extra context directories](../../subjects/cli/Extra%20context%20directories.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is the flag safe to repeat (--add-dir A --add-dir B)? The help text shows a variadic form; the docs example lists directories after one flag.
---
