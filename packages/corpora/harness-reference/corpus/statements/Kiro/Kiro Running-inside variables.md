---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/current-env
  object:
    supported: true
    vars:
      - name: AGENT_DISPLAY_OUT
        value: any
        meaning: path of a per-invocation FIFO whose lines reach the terminal UI only
      - name: AGENT_CONTEXT_OUT
        value: any
        meaning: path of a per-invocation FIFO whose lines land in the tool result's agent_notes
    set_by: child-commands
    note: Documented as output side channels for wrapper scripts, not as markers; the docs say both are set only when the agent is driving the command.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro shell side channel variables](../../study-results/Kiro/2026-11-14%20kiro%20shell%20side%20channel%20variables.md)"
      - "[2026-11-14 kiro side channel variables only under the agent](../../study-results/Kiro/2026-11-14%20kiro%20side%20channel%20variables%20only%20under%20the%20agent.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: set only for commands the agent runs."
  - hasEvidenceItems:
      - "[2026-11-14 kiro AGENT_CONTEXT_OUT](../../study-results/Kiro/2026-11-14%20kiro%20AGENT_CONTEXT_OUT.md)"
      - "[2026-11-14 kiro AGENT_DISPLAY_OUT](../../study-results/Kiro/2026-11-14%20kiro%20AGENT_DISPLAY_OUT.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the two variables."
reportedIn:
  - "[Kiro docs Built-in tools reference](../../documents/kiro.dev/Kiro%20docs%20Built-in%20tools%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Running-inside variables](../../subjects/cli/Running-inside%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
