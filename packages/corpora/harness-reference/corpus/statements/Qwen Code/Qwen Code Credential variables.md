---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: config/credentials-env
  object:
    supported: true
    login_command: /auth (inside the CLI)
    vars:
      - name: OPENAI_API_KEY
        kind: api-key
        provider: openai-compatible
      - name: ANTHROPIC_API_KEY
        kind: api-key
        provider: anthropic
      - name: GEMINI_API_KEY
        kind: api-key
        provider: gemini
      - name: QWENCLOUD_API_KEY
        kind: api-key
        provider: QwenCloud
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code OpenAI API key docs](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20OpenAI%20API%20key%20docs.md)"
      - "[2026-11-09 Qwen Code Anthropic API key docs](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Anthropic%20API%20key%20docs.md)"
      - "[2026-11-09 Qwen Code Gemini API key docs](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Gemini%20API%20key%20docs.md)"
      - "[2026-11-09 Qwen Code QwenCloud API key docs](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20QwenCloud%20API%20key%20docs.md)"
      - "[2026-11-09 Qwen Code Auth command docs](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Auth%20command%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: auth docs at v0.27.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Credential variables](../../subjects/config/Credential%20variables.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
