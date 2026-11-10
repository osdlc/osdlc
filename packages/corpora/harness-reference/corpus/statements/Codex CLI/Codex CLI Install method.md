---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        platforms:
          - macos
          - linux
        note: curl -fsSL https://chatgpt.com/codex/install.sh | sh
      - kind: script
        platforms:
          - windows
        note: powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
      - kind: npm
        argv:
          - npm
          - install
          - -g
          - "@openai/codex"
        package: "@openai/codex"
      - kind: brew
        argv:
          - brew
          - install
          - --cask
          - codex
        package: codex
    update: codex update
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Install method README script](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Install%20method%20README%20script.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Install method README npm](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Install%20method%20README%20npm.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Install method README brew](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Install%20method%20README%20brew.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Install method README platforms](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Install%20method%20README%20platforms.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Install method README windows](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Install%20method%20README%20windows.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-09 at 0.162.0.
  - hasEvidenceItems:
      - "[2026-11-09 Codex CLI Install method help](../../study-results/Codex%20CLI/2026-11-09%20Codex%20CLI%20Install%20method%20help.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: help-text observed 2026-11-09 at 0.162.0.
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
