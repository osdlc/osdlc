---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: cli/model-selection
  object:
    model: --model <model> (alias such as sonnet, opus, haiku, fable, or a full model name)
    effort: --effort <level>
    context: ANTHROPIC_MODEL environment variable sets the model too
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 help effort](../../study-results/Claude%20Code/2026-11-09%20help%20effort.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "Help text: --effort sets the effort level."
  - hasEvidenceItems:
      - "[2026-11-09 docs cli model](../../study-results/Claude%20Code/2026-11-09%20docs%20cli%20model.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The CLI reference names ANTHROPIC_MODEL.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Model and effort flags](../../subjects/cli/Model%20and%20effort%20flags.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Does CLAUDE_CODE_OAUTH_TOKEN take precedence over keychain credentials, and do Bedrock, Vertex and Foundry use their own provider credentials? Neither is in a quoted excerpt
---
