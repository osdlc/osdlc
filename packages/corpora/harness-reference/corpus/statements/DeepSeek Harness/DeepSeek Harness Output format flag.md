---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: cli/output-format
  object:
    supported: true
    formats:
      - name: text
        argv: []
      - name: json
        argv:
          - --json
    note: Default prints only the final message on stdout; --json writes newline-delimited run events instead. Applies to the headless profile.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 headless help json](../../study-results/DeepSeek%20Harness/2026-11-09%20headless%20help%20json.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09.
  - hasEvidenceItems:
      - "[2026-11-09 headless help usage](../../study-results/DeepSeek%20Harness/2026-11-09%20headless%20help%20usage.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09.
reportedIn:
  - "[deepseek-ai deepseek-harness cli-help.md at fcc0ad4](../../documents/github.com/deepseek-ai%20deepseek-harness%20cli-help.md%20at%20fcc0ad4.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Output format flag](../../subjects/cli/Output%20format%20flag.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---


