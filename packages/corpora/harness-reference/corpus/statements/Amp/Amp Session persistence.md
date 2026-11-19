---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    persists_by_default: true
    resumable_by_id: true
    note: A run is a thread with its own URL on ampcode.com. Execute mode archives a new thread when the turn ends; --no-archive-after-execute keeps it unarchived. An archived thread's URL still works. The docs name no way to run without creating a thread.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 thread URL](../../study-results/Amp/2026-11-14%20thread%20URL.md)"
      - "[2026-11-14 archived thread stays reachable](../../study-results/Amp/2026-11-14%20archived%20thread%20stays%20reachable.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The threads page says every thread has a URL and stays reachable when archived.
  - hasEvidenceItems:
      - "[2026-11-14 execute mode archives a new thread](../../study-results/Amp/2026-11-14%20execute%20mode%20archives%20a%20new%20thread.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The spawning orbs page says execute mode archives a new thread and names the flag that keeps it.
  - hasEvidenceItems:
      - "[2026-11-14 threads continue by id](../../study-results/Amp/2026-11-14%20threads%20continue%20by%20id.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: A thread is continued by id.
reportedIn:
  - "[Amp docs Threads](../../documents/ampcode.com/Amp%20docs%20Threads.md)"
  - "[Amp docs Spawning Orbs](../../documents/ampcode.com/Amp%20docs%20Spawning%20Orbs.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

