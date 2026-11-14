---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: plugins/session-load
  object:
    supported: true
    load_argv:
      - "--patch"
      - "{file}"
    repeatable: true
    persists: false
    note: "The argument is a patch file, not a plugin directory. Its rows are applied for this boot only; a relative plugin name in an inserted row resolves beside the patch file."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh launcher help options](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20launcher%20help%20options.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The launcher help lists --patch <path> as a repeatable overlay."
  - hasEvidenceItems:
      - "[2026-11-14 dsh profile patch layer order](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20profile%20patch%20layer%20order.md)"
      - "[2026-11-14 dsh relative plugin names in a patch](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20relative%20plugin%20names%20in%20a%20patch.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The CLI reference says a --patch overlay may insert rows and how plugin names in them resolve."
  - hasEvidenceItems:
      - "[2026-11-14 dsh mcp overlay with patch](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20mcp%20overlay%20with%20patch.md)"
      - "[2026-11-14 dsh patch selection across runs](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20patch%20selection%20across%20runs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The MCP guide loads a plugin row with --patch, and says keeping it across runs needs a user patch layer."
reportedIn:
  - "[deepseek-ai deepseek-harness cli-help.md at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20cli-help.md%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness apps cli reference README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20apps%20cli%20reference%20README%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness mcp-memory guide at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20mcp-memory%20guide%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Session-only plugins](../../subjects/plugins/Session-only%20plugins.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Moderate: the launcher help shows the flag, but that an overlay loads a plugin for one run rests on the docs.
