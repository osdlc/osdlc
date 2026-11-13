---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/binary
  object:
    supported: true
    name: claude
    version_argv:
      - --version
    path_hint: ~/.local/bin/claude
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 version output](../../study-results/Claude%20Code/2026-11-09%20version%20output.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`claude --version` printed `2.1.319 (Claude Code)`."
  - hasEvidenceItems:
      - "[2026-11-09 docs setup launcher path](../../study-results/Claude%20Code/2026-11-09%20docs%20setup%20launcher%20path.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The setup page names ~/.local/bin/claude as the native launcher on macOS and Linux.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Executable name](../../subjects/cli/Executable%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
