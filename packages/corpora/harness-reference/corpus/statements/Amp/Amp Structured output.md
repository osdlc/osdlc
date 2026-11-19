---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/structured-output
  object:
    output: "--stream-json with --execute (JSON lines: system init, user, assistant, result)"
    input: --stream-json-input (needs --stream-json)
    last_message: plain --execute prints the final message
    schema: follows Claude Code's stream JSON format; --stream-json-thinking adds thinking blocks that are not in it
    argv:
      - --execute
      - "{prompt}"
      - --stream-json
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 streaming json flag](../../study-results/Amp/2026-11-09%20streaming%20json%20flag.md)"
      - "[2026-11-09 streaming json requires execute](../../study-results/Amp/2026-11-09%20streaming%20json%20requires%20execute.md)"
      - "[2026-11-14 init and result messages](../../study-results/Amp/2026-11-14%20init%20and%20result%20messages.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The streaming JSON page names the flag and the message sequence.
  - hasEvidenceItems:
      - "[2026-11-14 stream json input flag](../../study-results/Amp/2026-11-14%20stream%20json%20input%20flag.md)"
      - "[2026-11-14 stream json thinking flag](../../study-results/Amp/2026-11-14%20stream%20json%20thinking%20flag.md)"
      - "[2026-11-14 stream json Claude Code compatibility](../../study-results/Amp/2026-11-14%20stream%20json%20Claude%20Code%20compatibility.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The same page names the input and thinking flags and the format it follows.
  - hasEvidenceItems:
      - "[2026-11-09 execute mode flag](../../study-results/Amp/2026-11-09%20execute%20mode%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The execute mode page says plain execute mode prints the final message.
reportedIn:
  - "[Amp docs Streaming JSON](../../documents/ampcode.com/Amp%20docs%20Streaming%20JSON.md)"
  - "[Amp docs Execute Mode](../../documents/ampcode.com/Amp%20docs%20Execute%20Mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Structured output](../../subjects/cli/Structured%20output.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

