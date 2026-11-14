---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: hooks/events
  object:
    count: "6"
    via: "plugin code: amp.on(<event>, handler)"
    events:
      - session.start
      - tool.call
      - tool.result
      - agent.start
      - agent.end
      - changes.prompt
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 plugin event map](../../study-results/Amp/2026-11-14%20plugin%20event%20map.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The generated Plugin API reference lists the event names in PluginEventMap.
  - hasEvidenceItems:
      - "[2026-11-14 plugin event handlers](../../study-results/Amp/2026-11-14%20plugin%20event%20handlers.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins page says events are handled with amp.on.
reportedIn:
  - "[Amp docs Plugin API](../../documents/ampcode.com/Amp%20docs%20Plugin%20API.md)"
  - "[Amp docs Plugins](../../documents/ampcode.com/Amp%20docs%20Plugins.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

