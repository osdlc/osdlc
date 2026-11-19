---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    mechanism: "Remote Control: prompts sent from a browser reach the running CLI session"
    command: /remote-control, or agy --remote-control
    headless: --input-format stream-json feeds prompts on stdin to a process the caller started
    limit: the session must have Remote Control on
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 remote control live prompts](../../study-results/Antigravity/2026-11-14%20remote%20control%20live%20prompts.md)"
      - "[2026-11-14 remote control enable](../../study-results/Antigravity/2026-11-14%20remote%20control%20enable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The Remote Control page says prompts sent from a remote device stream into the local terminal session.
  - hasEvidenceItems:
      - "[2026-11-14 headless stream-json stdin](../../study-results/Antigravity/2026-11-14%20headless%20stream-json%20stdin.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless page describes feeding prompts on stdin to one process.
reportedIn:
  - "[Antigravity docs Remote Control](../../documents/antigravity.google/Antigravity%20docs%20Remote%20Control.md)"
  - "[Antigravity docs CLI headless mode](../../documents/antigravity.google/Antigravity%20docs%20CLI%20headless%20mode.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

A session with Remote Control on takes prompts from the Antigravity web UI while it runs in the terminal. `--input-format stream-json` keeps one headless process open and reads prompts from its stdin, so it reaches only a process the caller started. The docs describe no command that sends a message from one shell into another running session.
