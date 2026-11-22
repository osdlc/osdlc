---
proposition:
  subject: '[Bazel](../../stores/Bazel.md)'
  predicate: liveness/in-use
  object:
    processes:
    - bazel server (A-server.jar)
    locks:
    - <outputBase>/server
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bazel in use 1](../../study-results/Bazel/2026-11-21%20Bazel%20in%20use%201.md)'
  - '[2026-11-21 Bazel in use 2](../../study-results/Bazel/2026-11-21%20Bazel%20in%20use%202.md)'
  - '[2026-11-21 Bazel in use 3](../../study-results/Bazel/2026-11-21%20Bazel%20in%20use%203.md)'
  - '[2026-11-21 Bazel in use 4](../../study-results/Bazel/2026-11-21%20Bazel%20in%20use%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The docs describe a long-lived Bazel server per output base with its PID and port under
    outputBase/server, a server lock, and a 3-hour idle timeout; bazel shutdown stops it.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bazel](../../stores/Bazel.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The exact lock file name inside the output base is not given in the pages read.
---

The docs describe a long-lived Bazel server per output base with its PID and port under outputBase/server, a server lock, and a 3-hour idle timeout; bazel shutdown stops it.
