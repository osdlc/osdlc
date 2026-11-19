---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: cli/headless
  object:
    flag: -p/--single
    argv:
      - -p
      - "{prompt}"
    stdin: not read into the prompt; pass content by command substitution or --prompt-file
    resume: -r/--resume <id>
    fork: --fork-session with -r or -c
    note: --prompt-json and --prompt-file also start a headless run; --print is an alias of --single
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli single flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20single%20flag.md)"
      - "[2026-11-14 grok cli prompt-json flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20prompt-json%20flag.md)"
      - "[2026-11-14 grok cli prompt-file flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20prompt-file%20flag.md)"
      - "[2026-11-14 grok cli fork-session flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20fork-session%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definitions of -p/--single, --prompt-json and --prompt-file.
  - hasEvidenceItems:
      - "[2026-11-14 grok headless trigger](../../study-results/Grok%20Build/2026-11-14%20grok%20headless%20trigger.md)"
      - "[2026-11-14 grok headless stdin](../../study-results/Grok%20Build/2026-11-14%20grok%20headless%20stdin.md)"
      - "[2026-11-14 grok resume flag doc](../../study-results/Grok%20Build/2026-11-14%20grok%20resume%20flag%20doc.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless guide.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Headless run](../../subjects/cli/Headless%20run.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
