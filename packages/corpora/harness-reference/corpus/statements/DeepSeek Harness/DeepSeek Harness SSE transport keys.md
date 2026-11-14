---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: mcp/sse
  object:
    supported: false
    basis: documented
    note: The mcp-client transport key takes stdio or streamable-http only.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh mcp config union](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20mcp%20config%20union.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The mcp-client Config type is a union of the stdio and Streamable HTTP configs. Absence in source is moderate."
  - hasEvidenceItems:
      - "[2026-11-14 dsh mcp transport values](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20mcp%20transport%20values.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: weak
    description: "The mcp-client README gives stdio and streamable-http as the transport values. Absence in docs is weak."
reportedIn:
  - "[deepseek-ai deepseek-harness mcp-client index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20mcp-client%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness mcp-client README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20mcp-client%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[SSE transport keys](../../subjects/mcp/SSE%20transport%20keys.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
