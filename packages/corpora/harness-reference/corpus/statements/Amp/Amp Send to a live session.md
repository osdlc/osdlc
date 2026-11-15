---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    command: amp threads continue <T-id> -ox <message>
    headless: "--stream-json-input reads user messages from stdin until it closes; a message sent while the agent is busy is queued, or handled at the next interruption point with steer: true"
    mechanism: the command sends one message to an existing orb thread without attaching; a running CLI thread also takes messages from ampcode.com through Cross-Client Access
    limit: the documented command is for orb threads
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 send one message to an orb thread](../../study-results/Amp/2026-11-14%20send%20one%20message%20to%20an%20orb%20thread.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The spawning orbs page gives the command for an existing orb thread.
  - hasEvidenceItems:
      - "[2026-11-14 stream json input flag](../../study-results/Amp/2026-11-14%20stream%20json%20input%20flag.md)"
      - "[2026-11-14 stream json input queues while busy](../../study-results/Amp/2026-11-14%20stream%20json%20input%20queues%20while%20busy.md)"
      - "[2026-11-14 stream json input steer](../../study-results/Amp/2026-11-14%20stream%20json%20input%20steer.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The streaming JSON page describes sending several messages into one run.
  - hasEvidenceItems:
      - "[2026-11-14 cross-client access](../../study-results/Amp/2026-11-14%20cross-client%20access.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The cross-client access page says a running CLI thread can be continued from the web.
reportedIn:
  - "[Amp docs Spawning Orbs](../../documents/ampcode.com/Amp%20docs%20Spawning%20Orbs.md)"
  - "[Amp docs Streaming JSON](../../documents/ampcode.com/Amp%20docs%20Streaming%20JSON.md)"
  - "[Amp docs Cross-Client Access](../../documents/ampcode.com/Amp%20docs%20Cross-Client%20Access.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

