---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    mechanism: "cross-session messaging: the model in one session sends to another with the `send_message` tool, addressed by the name `qwen sessions ps --json` records"
    input_file: "`--input-file <path>`: an external process writes JSONL commands that the TUI watches and processes"
    limit: only a session that bound a peer inbox can be reached; the OpenTUI interface binds none
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Cross-session messaging docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Cross-session%20messaging%20docs.md)"
      - "[2026-11-14 Qwen Code Peer inbox limits docs](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Peer%20inbox%20limits%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at v0.27.3: cross-session messaging and which sessions it reaches"
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Input file option source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Input%20file%20option%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "option source at v0.27.3: --input-file"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

There is no CLI command that sends one message to a running session. A running interactive session can get a message from the model of another session, through `send_message`, or from a file named with `--input-file` when the session was started. The value is `partial` because only sessions with a peer inbox, or started with an input file, can be reached. The strength is held at moderate because the main mechanism rests on docs.
