---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/binary
  object:
    supported: true
    name: grok
    version_argv:
      - --version
    path_hint: ~/.grok/bin/grok
    note: -v is the short form and `grok version` a subcommand. The path is the managed install, $GROK_HOME/bin/grok; the PowerShell installer adds %USERPROFILE%\.grok\bin to PATH.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli name](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20name.md)"
      - "[2026-11-14 grok cli version flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20version%20flag.md)"
      - "[2026-11-14 grok cli version subcommand](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20version%20subcommand.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The command name and the version flag and subcommand in the argument definitions.
  - hasEvidenceItems:
      - "[2026-11-14 grok version check](../../study-results/Grok%20Build/2026-11-14%20grok%20version%20check.md)"
      - "[2026-11-14 grok managed install path](../../study-results/Grok%20Build/2026-11-14%20grok%20managed%20install%20path.md)"
      - "[2026-11-14 grok windows bin path](../../study-results/Grok%20Build/2026-11-14%20grok%20windows%20bin%20path.md)"
      - "[2026-11-14 grok GROK_HOME row](../../study-results/Grok%20Build/2026-11-14%20grok%20GROK_HOME%20row.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The guides show grok --version and name the managed install path.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Getting started](../../documents/github.com/Grok%20Build%20user%20guide%20Getting%20started.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Executable name](../../subjects/cli/Executable%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
