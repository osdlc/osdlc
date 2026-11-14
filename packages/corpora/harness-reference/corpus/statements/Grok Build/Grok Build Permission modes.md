---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: permissions/modes
  object:
    supported: true
    modes:
      - name: acceptEdits
        intent: edits
        config_key: defaultMode in .claude/settings.json
        notes: file edits run without a prompt
      - name: auto
        intent: full-auto
        argv:
          - --permission-mode
          - auto
        config_key: '[ui] permission_mode = "auto"'
        notes: runs the work a safety check allows; other calls are blocked or escalated
      - name: dontAsk
        intent: deny-unapproved
        config_key: defaultMode in .claude/settings.json
        notes: only pre-approved tools and built-in read-only handling run
      - name: bypassPermissions
        intent: bypass
        argv:
          - --always-approve
        aliases:
          - always-approve
          - yolo
        config_key: '[ui] permission_mode = "always-approve"'
        notes: --permission-mode bypassPermissions and --yolo select it too; deny rules, hooks and some shell ask rules still apply
      - name: plan
        intent: plan
        config_key: defaultMode in .claude/settings.json
        notes: accepted for compatibility; plan mode is the gated planning feature
    default: default
    note: default (ask) runs read-only tools and built-in read-only shell commands without asking. --permission-mode accepts default, acceptEdits, auto, dontAsk, bypassPermissions and plan; the docs show it with auto and bypassPermissions.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok permission mode values](../../study-results/Grok%20Build/2026-11-14%20grok%20permission%20mode%20values.md)"
      - "[2026-11-14 grok cli permission-mode flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20permission-mode%20flag.md)"
      - "[2026-11-14 grok cli always-approve flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20always-approve%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The mode values --permission-mode accepts, and the always-approve flag.
  - hasEvidenceItems:
      - "[2026-11-14 grok mode default row](../../study-results/Grok%20Build/2026-11-14%20grok%20mode%20default%20row.md)"
      - "[2026-11-14 grok mode acceptEdits row](../../study-results/Grok%20Build/2026-11-14%20grok%20mode%20acceptEdits%20row.md)"
      - "[2026-11-14 grok mode plan row](../../study-results/Grok%20Build/2026-11-14%20grok%20mode%20plan%20row.md)"
      - "[2026-11-14 grok mode auto row](../../study-results/Grok%20Build/2026-11-14%20grok%20mode%20auto%20row.md)"
      - "[2026-11-14 grok mode dontAsk row](../../study-results/Grok%20Build/2026-11-14%20grok%20mode%20dontAsk%20row.md)"
      - "[2026-11-14 grok mode bypass row](../../study-results/Grok%20Build/2026-11-14%20grok%20mode%20bypass%20row.md)"
      - "[2026-11-14 grok always-approve cli row](../../study-results/Grok%20Build/2026-11-14%20grok%20always-approve%20cli%20row.md)"
      - "[2026-11-14 grok permission mode auto cli](../../study-results/Grok%20Build/2026-11-14%20grok%20permission%20mode%20auto%20cli.md)"
      - "[2026-11-14 grok permission_mode config](../../study-results/Grok%20Build/2026-11-14%20grok%20permission_mode%20config.md)"
      - "[2026-11-14 grok defaultMode values](../../study-results/Grok%20Build/2026-11-14%20grok%20defaultMode%20values.md)"
      - "[2026-11-14 grok permission mode row](../../study-results/Grok%20Build/2026-11-14%20grok%20permission%20mode%20row.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The permissions guide: the mode table and how to set a mode."
reportedIn:
  - "[xai-org grok-build agent config.rs](../../documents/github.com/xai-org%20grok-build%20agent%20config.rs.md)"
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Permissions and safety](../../documents/github.com/Grok%20Build%20user%20guide%20Permissions%20and%20safety.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Permission modes](../../subjects/permissions/Permission%20modes.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The intents are our mapping of the guide's table. An `argv` is given only where the docs show the flag in use.
