---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: permissions/tool-rules
  object:
    supported: partial
    config_key: permission.yaml, with always_allow, ask_before and never_allow lists of tool names
    note: No per-run flag. The file sits in the config directory and is written by goose configure (Tool Permission). Tool permissions override the mode for single tools.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose permission config struct](../../study-results/goose/2026-11-14%20goose%20permission%20config%20struct.md)"
      - "[2026-11-14 goose permission file name](../../study-results/goose/2026-11-14%20goose%20permission%20file%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The permission config has three lists of tools and is stored in permission.yaml.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs permission.yaml](../../study-results/goose/2026-11-14%20goose%20docs%20permission.yaml.md)"
      - "[2026-11-14 goose docs tool permissions override mode](../../study-results/goose/2026-11-14%20goose%20docs%20tool%20permissions%20override%20mode.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The docs name the file and say tool permissions override the mode.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli run option groups](../../study-results/goose/2026-11-14%20goose%20cli%20run%20option%20groups.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The option groups of goose run hold no allow or deny flag.
reportedIn:
  - "[aaif-goose goose permission.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20permission.rs%20at%202365bc5.md)"
  - "[aaif-goose goose config-files.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20config-files.md%20at%202365bc5.md)"
  - "[aaif-goose goose tool-permissions.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20tool-permissions.md%20at%202365bc5.md)"
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Per-tool rules live in `permission.yaml`: always allow, ask before, never allow. There is no flag that sets them for one run.
