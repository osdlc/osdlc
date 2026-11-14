---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/headless
  object:
    command: kiro-cli chat --no-interactive "<prompt>"
    flag: --no-interactive
    argv:
      - chat
      - --no-interactive
      - <prompt>
    stdin: piped stdin is read as the instruction when no positional argument is given
    one_task_per_run: true
    resume: --resume or --resume-id <ID>
    note: The docs say headless mode requires an API key in KIRO_API_KEY. A local headless run that names no harness runs V2; add --v3 or --v2 to fix it.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless no-interactive flag](../../study-results/Kiro/2026-11-14%20kiro%20headless%20no-interactive%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the flag and where the instruction comes from."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless stdin](../../study-results/Kiro/2026-11-14%20kiro%20headless%20stdin.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: stdin as the instruction."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless no mid-session input](../../study-results/Kiro/2026-11-14%20kiro%20headless%20no%20mid-session%20input.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: no further input in a run."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless resume-id flag](../../study-results/Kiro/2026-11-14%20kiro%20headless%20resume-id%20flag.md)"
      - "[2026-11-14 kiro cli resume with no-interactive](../../study-results/Kiro/2026-11-14%20kiro%20cli%20resume%20with%20no-interactive.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: resuming in a headless run."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless api key](../../study-results/Kiro/2026-11-14%20kiro%20headless%20api%20key.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the API key requirement."
  - hasEvidenceItems:
      - "[2026-11-14 kiro headless default harness](../../study-results/Kiro/2026-11-14%20kiro%20headless%20default%20harness.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the default harness of a headless run."
reportedIn:
  - "[Kiro docs Headless mode](../../documents/kiro.dev/Kiro%20docs%20Headless%20mode.md)"
  - "[Kiro docs Session Management](../../documents/kiro.dev/Kiro%20docs%20Session%20Management.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Headless run](../../subjects/cli/Headless%20run.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
