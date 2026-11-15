---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/headless
  object:
    command: amp -x <prompt>
    flag: -x, --execute
    stdin: piped input is accepted with -x
    one_task_per_run: true
    resume: amp threads continue --execute <prompt>
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 execute mode flag](../../study-results/Amp/2026-11-09%20execute%20mode%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 execute mode stdin](../../study-results/Amp/2026-11-09%20execute%20mode%20stdin.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 streaming json continue command](../../study-results/Amp/2026-11-09%20streaming%20json%20continue%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-09.
reportedIn:
  - "[Amp docs Execute Mode](../../documents/ampcode.com/Amp%20docs%20Execute%20Mode.md)"
  - "[Amp docs Streaming JSON](../../documents/ampcode.com/Amp%20docs%20Streaming%20JSON.md)"
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
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Headless run](../../subjects/cli/Headless%20run.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---


