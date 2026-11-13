---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: npm
        argv:
          - npm
          - install
          - -g
          - "@google/gemini-cli"
        package: "@google/gemini-cli"
      - kind: brew
        argv:
          - brew
          - install
          - gemini-cli
        package: gemini-cli
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Install docs](../../study-results/Gemini%20CLI/2026-11-09%20Install%20docs.md)"
      - "[2026-11-09 Install brew docs](../../study-results/Gemini%20CLI/2026-11-09%20Install%20brew%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: README installation section.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
