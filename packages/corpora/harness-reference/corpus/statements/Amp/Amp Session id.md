---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/session-id
  object:
    supported: partial
    format: T-<uuid>
    reported_in:
      - event
      - result
    result_field: session_id
    obtained_by: event
    note: With --stream-json the init system message and the result message carry session_id. -ox prints the thread URL, which ends in the id. The docs name no flag that assigns an id.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 session_id in the result message](../../study-results/Amp/2026-11-14%20session_id%20in%20the%20result%20message.md)"
      - "[2026-11-14 init and result messages](../../study-results/Amp/2026-11-14%20init%20and%20result%20messages.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The streaming JSON page shows the id in the output messages.
  - hasEvidenceItems:
      - "[2026-11-14 orb execute prints the thread URL](../../study-results/Amp/2026-11-14%20orb%20execute%20prints%20the%20thread%20URL.md)"
      - "[2026-11-14 thread URL](../../study-results/Amp/2026-11-14%20thread%20URL.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The thread URL carries the id.
reportedIn:
  - "[Amp docs Streaming JSON](../../documents/ampcode.com/Amp%20docs%20Streaming%20JSON.md)"
  - "[Amp docs Spawning Orbs](../../documents/ampcode.com/Amp%20docs%20Spawning%20Orbs.md)"
  - "[Amp docs Threads](../../documents/ampcode.com/Amp%20docs%20Threads.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Session id](../../subjects/cli/Session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

