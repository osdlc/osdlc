---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: npm
        argv:
          - npm
          - install
          - -g
          - "@qwen-code/qwen-code@latest"
        package: "@qwen-code/qwen-code"
      - kind: brew
        argv:
          - brew
          - install
          - qwen-code
        package: qwen-code
      - kind: script
        argv:
          - bash
          - -c
          - curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code README npm install](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20README%20npm%20install.md)"
      - "[2026-11-09 Qwen Code README brew install](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20README%20brew%20install.md)"
      - "[2026-11-09 Qwen Code README curl install](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20README%20curl%20install.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: README at v0.27.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
