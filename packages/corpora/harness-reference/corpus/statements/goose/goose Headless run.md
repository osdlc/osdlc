---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/headless
  object:
    command: goose run -t <TEXT>
    flag: -t, --text <TEXT>; -i, --instructions <FILE>; --recipe <RECIPE>
    stdin: -i - reads the instructions from stdin
    resume: goose run --resume [-n <NAME> | --session-id <ID>] -t <TEXT>
    note: The run exits when the task is done; -s, --interactive stays in the session instead.
    argv:
      - run
      - --text
      - "{prompt}"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli run command](../../study-results/goose/2026-11-14%20goose%20cli%20run%20command.md)"
      - "[2026-11-14 goose cli text flag](../../study-results/goose/2026-11-14%20goose%20cli%20text%20flag.md)"
      - "[2026-11-14 goose cli instructions flag](../../study-results/goose/2026-11-14%20goose%20cli%20instructions%20flag.md)"
      - "[2026-11-14 goose cli interactive flag](../../study-results/goose/2026-11-14%20goose%20cli%20interactive%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The clap definition of goose run and its input flags.
  - hasEvidenceItems:
      - "[2026-11-14 goose cli headless call](../../study-results/goose/2026-11-14%20goose%20cli%20headless%20call.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: Without --interactive, the run command calls the headless path.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs run exits](../../study-results/goose/2026-11-14%20goose%20docs%20run%20exits.md)"
      - "[2026-11-14 goose docs run stdin](../../study-results/goose/2026-11-14%20goose%20docs%20run%20stdin.md)"
      - "[2026-11-14 goose docs run resume by name](../../study-results/goose/2026-11-14%20goose%20docs%20run%20resume%20by%20name.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The running-tasks guide says the run exits when the task is complete, reads stdin with -i -, and resumes with -r.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose running-tasks.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20running-tasks.md%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Headless run](../../subjects/cli/Headless%20run.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`goose run` is the one-shot command. The prompt comes from `-t`, an instruction file (`-i`), stdin (`-i -`) or a recipe.
