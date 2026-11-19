---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: hooks/events
  object:
    via: JS/TS plugin hooks, registered with ctx.<domain>.hook(name, callback)
    events:
      - session:fork
      - session:prompt
      - session:context
      - session:compaction
      - session:generate
      - session:title
      - session:experimental.model.resolve
      - session:model.request
      - session:http.request
      - session:http.response
      - session:experimental.ws.handshake
      - session:experimental.ws.send
      - session:experimental.ws.receive
      - session:retry
      - session:experimental.idle
      - permission:evaluate
      - shell:create.before
      - tool:execute.before
      - tool:execute.after
    note: each entry is domain:name; session names are from source, permission, shell and tool names from the docs; other hook domains were not checked
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode session hooks source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20session%20hooks%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The SessionHooks interface in the plugin package lists the session hook names.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugin docs hooks intro v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20hooks%20intro%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin docs permission hook v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20permission%20hook%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin docs shell hook v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20shell%20hook%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin docs tool hooks v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20tool%20hooks%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The server plugin page documents the permission, shell and tool hooks.
reportedIn:
  - "[OpenCode source plugin promise session.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20plugin%20promise%20session.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source Build plugins server at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20Build%20plugins%20server%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

Hooks are plugin callbacks, not shell commands. The list may be incomplete: the plugin package has more hook domains than were read.
