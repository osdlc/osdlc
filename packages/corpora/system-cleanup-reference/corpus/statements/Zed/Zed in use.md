---
proposition:
  subject: '[Zed](../../stores/Zed.md)'
  predicate: liveness/in-use
  object:
    processes:
    - zed
    locks:
    - ~/.local/share/zed/zed-<channel>.sock
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Zed in use 1](../../study-results/Zed/2026-11-21%20Zed%20in%20use%201.md)'
  - '[2026-11-21 Zed in use 2](../../study-results/Zed/2026-11-21%20Zed%20in%20use%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: On Linux the CLI looks for a datagram socket named zed-<release channel>.sock in the data
    dir to reach a running Zed; the uninstall doc tells users to quit Zed first.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Zed](../../stores/Zed.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The running process name on each platform is not stated by a doc; zed is the binary name the macOS bundle
  path uses.
- The socket applies to Linux; macOS and Windows use other single-instance mechanisms not covered here.
---

On Linux the CLI looks for a datagram socket named zed-<release channel>.sock in the data dir to reach a running Zed; the uninstall doc tells users to quit Zed first.
