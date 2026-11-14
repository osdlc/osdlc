---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/append-system-prompt
  object:
    supported: true
    flag: --system <TEXT>
    reaches_model: true
    note: Kept for -t <TEXT> and for -i - (stdin); dropped when -i names an instruction file. Conflicts with --recipe.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli system flag](../../study-results/goose/2026-11-14%20goose%20cli%20system%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: goose run defines --system as an additional system prompt.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli system dropped for instruction file](../../study-results/goose/2026-11-14%20goose%20cli%20system%20dropped%20for%20instruction%20file.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: parse_run_input passes the flag on for text and stdin input and sets it to None for an instruction file.
  - hasEvidenceItems:
      - "[2026-11-14 goose builder system prompt extra](../../study-results/goose/2026-11-14%20goose%20builder%20system%20prompt%20extra.md)"
      - "[2026-11-14 goose prompt manager extras](../../study-results/goose/2026-11-14%20goose%20prompt%20manager%20extras.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The text is stored as a system prompt extra, and the system prompt builder adds the session extras.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs system flag](../../study-results/goose/2026-11-14%20goose%20docs%20system%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference lists --system among the run input options.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose session builder.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20session%20builder.rs%20at%202365bc5.md)"
  - "[aaif-goose goose prompt_manager.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20prompt_manager.rs%20at%202365bc5.md)"
  - "[aaif-goose goose goose-cli-commands.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose-cli-commands.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Appended system prompt](../../subjects/cli/Appended%20system%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does a slash command at the start of the prompt still parse when --system is set? The parser looks only at the message, but no run confirms it.
---

goose run takes `--system <TEXT>`. The CLI stores the text as a system prompt extra named `additional`, and the prompt builder adds the extras to the system prompt. The flag is dropped when the input is an instruction file (`-i <FILE>`).
