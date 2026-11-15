---
proposition:
  subject: "[Cursor](../../harnesses/Cursor.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        package: https://cursor.com/install
        platforms:
          - macos
          - linux
        note: curl https://cursor.com/install -fsS | bash; Windows through WSL
      - kind: script
        package: https://cursor.com/install?win32=true
        platforms:
          - windows
        note: irm 'https://cursor.com/install?win32=true' | iex (native PowerShell)
    update: agent update
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Cursor help update](../../study-results/Cursor/2026-11-09%20Cursor%20help%20update.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The CLI lists an update command.
  - hasEvidenceItems:
      - "[2026-11-09 Cursor docs install platforms](../../study-results/Cursor/2026-11-09%20Cursor%20docs%20install%20platforms.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Platforms.
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
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Uninstall is not documented.

Audit fix 2026-11-09: values without a cited excerpt were removed or cited.
