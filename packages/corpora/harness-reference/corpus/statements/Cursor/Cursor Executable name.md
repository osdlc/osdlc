---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/binary
  object:
    supported: true
    name: agent
    aliases:
      - cursor-agent
    version_argv:
      - --version
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help binary](../../study-results/Cursor/2026-11-09%20Cursor%20help%20binary.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "cursor-agent --help prints its usage as `agent`: both names are one binary."
  - hasEvidenceItems:
      - "[2026-11-09 Cursor version](../../study-results/Cursor/2026-11-09%20Cursor%20version.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "`cursor-agent --version` prints the version."
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: verified
    date: 2026-11-09T12:00:00Z
harness: "[Cursor](../../harnesses/Cursor.md)"
subject: "[Executable name](../../subjects/cli/Executable%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The docs call the command `agent`; the installed `cursor-agent` is the same binary.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
