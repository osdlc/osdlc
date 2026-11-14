---
proposition:
  subject: "[Pi](../../harnesses/Pi.md)"
  predicate: hooks/events
  object:
    count: "41"
    via: pi.on(event, handler) in a TypeScript extension
    events:
      - project_trust
      - resources_discover
      - session_start
      - session_info_changed
      - session_before_switch
      - session_before_fork
      - session_before_compact
      - session_compact
      - session_compact_failed
      - session_shutdown
      - mcp_servers_change
      - session_before_tree
      - session_tree
      - context
      - context_with_system
      - cache_warming_decision
      - before_provider_request
      - before_provider_headers
      - after_provider_response
      - provider_stream_event
      - before_agent_start
      - agent_start
      - agent_end
      - agent_before_settle
      - agent_settled
      - ui_prompt_start
      - ui_prompt_end
      - turn_start
      - turn_end
      - message_start
      - message_update
      - message_end
      - tool_execution_start
      - tool_execution_update
      - tool_execution_end
      - model_select
      - thinking_level_select
      - tool_call
      - tool_result
      - user_bash
      - input
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Pi extension events source](../../study-results/Pi/2026-11-14%20Pi%20extension%20events%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The `on` overloads of ExtensionAPI, one per event; the list is every overload in the range the locator gives.
  - hasEvidenceItems:
      - "[2026-11-14 Pi docs extension events](../../study-results/Pi/2026-11-14%20Pi%20docs%20extension%20events.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: Extensions page on pi.on.
reportedIn:
  - "[Pi source extensions types.ts at v1.5.2](../../documents/github.com/Pi%20source%20extensions%20types.ts%20at%20v1.5.2.md)"
  - "[Pi docs Extensions at v1.5.2](../../documents/github.com/Pi%20docs%20Extensions%20at%20v1.5.2.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Pi](../../harnesses/Pi.md)"
subject: "[Hook events](../../subjects/hooks/Hook%20events.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The count is of the `on(event: ...)` overloads in `ExtensionAPI` at v1.5.2, counted by us; the source states no number.
