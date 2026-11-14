---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: instructions/system-prompt-flag
  object:
    supported: true
    append_argv:
      - --system
      - "{text}"
    env:
      GOOSE_SYSTEM_PROMPT_FILE_PATH: <file>
    note: GOOSE_SYSTEM_PROMPT_FILE_PATH is a config parameter; its file becomes the system prompt override. --system is on goose run and goose session; on goose run it conflicts with --recipe and is dropped for -i <FILE>.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli system flag](../../study-results/goose/2026-11-14%20goose%20cli%20system%20flag.md)"
      - "[2026-11-14 goose builder system prompt extra](../../study-results/goose/2026-11-14%20goose%20builder%20system%20prompt%20extra.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: --system adds an extra to the system prompt.
  - hasEvidenceItems:
      - "[2026-11-14 goose builder system prompt file](../../study-results/goose/2026-11-14%20goose%20builder%20system%20prompt%20file.md)"
      - "[2026-11-14 goose builder system prompt override](../../study-results/goose/2026-11-14%20goose%20builder%20system%20prompt%20override.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The builder reads GOOSE_SYSTEM_PROMPT_FILE_PATH and sets its content as the system prompt override.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs system flag](../../study-results/goose/2026-11-14%20goose%20docs%20system%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference lists --system.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose session builder.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20session%20builder.rs%20at%202365bc5.md)"
  - "[aaif-goose goose goose-cli-commands.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-cli-commands.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[System prompt flags](../../subjects/instructions/System%20prompt%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does the GOOSE_SYSTEM_PROMPT_FILE_PATH override drop every goose default, such as extension instructions? The docs do not mention the parameter.
---

`--system <TEXT>` appends to the system prompt. A file named by the config parameter `GOOSE_SYSTEM_PROMPT_FILE_PATH` overrides it.
