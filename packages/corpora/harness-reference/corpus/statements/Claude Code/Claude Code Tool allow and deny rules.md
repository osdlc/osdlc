---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    allow_argv:
      - --allowedTools
      - "{rules}"
    deny_argv:
      - --disallowedTools
      - "{rules}"
    syntax: Tool(pattern), for example Bash(git *); a bare tool name such as Edit
    precedence: deny, then ask, then allow; the first match wins
    note: A bare tool name in --disallowedTools removes the tool from the model context; a scoped rule only denies matching calls. --allowedTools only pre-approves; --tools restricts which tools exist.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 docs cli allowed tools](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20allowed%20tools.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference says allowed tools run without prompting.
  - hasEvidenceItems:
      - "[2026-11-09 docs cli disallowed tools](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20disallowed%20tools.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference says a bare name removes the tool and a scoped rule denies matching calls.
  - hasEvidenceItems:
      - "[2026-11-09 docs perm precedence](../../study-results/Claude%20Code/2026-11-09%20docs%20perm%20precedence.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The permissions page gives the rule order.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
