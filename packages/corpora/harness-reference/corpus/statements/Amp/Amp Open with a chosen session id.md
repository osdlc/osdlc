---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/open-with-id
  object:
    flags: --title <title>
    note: A caller can set the title of a new thread. The docs show thread ids in the form T-<uuid> and continue a thread by that id; they name no flag that sets the id.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 thread title flag](../../study-results/Amp/2026-11-14%20thread%20title%20flag.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The spawning orbs page names the title flag for a new execute-mode thread.
  - hasEvidenceItems:
      - "[2026-11-14 threads continue by id](../../study-results/Amp/2026-11-14%20threads%20continue%20by%20id.md)"
      - "[2026-11-14 session_id in the result message](../../study-results/Amp/2026-11-14%20session_id%20in%20the%20result%20message.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Threads are continued by their T- id, which the examples show as assigned.
reportedIn:
  - "[Amp docs Spawning Orbs](../../documents/ampcode.com/Amp%20docs%20Spawning%20Orbs.md)"
  - "[Amp docs Threads](../../documents/ampcode.com/Amp%20docs%20Threads.md)"
  - "[Amp docs Streaming JSON](../../documents/ampcode.com/Amp%20docs%20Streaming%20JSON.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Open with a chosen session id](../../subjects/cli/Open%20with%20a%20chosen%20session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

