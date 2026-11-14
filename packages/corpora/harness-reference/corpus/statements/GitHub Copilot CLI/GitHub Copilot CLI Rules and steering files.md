---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: instructions/rules
  object:
    supported: true
    dir: .github/instructions/**/*.instructions.md
    attach_by: frontmatter `applyTo` (or `paths`) glob; delivered when the agent reads or edits a matching file
    also:
      - .claude/rules/**/*.md
      - ~/.copilot/instructions/**/*.instructions.md
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Scoped rules frontmatter docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Scoped%20rules%20frontmatter%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Claude rule files docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Claude%20rule%20files%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Scoped rules delivery docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Scoped%20rules%20delivery%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The command reference describes scoped rule files.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Path-specific instructions docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Path-specific%20instructions%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI User instruction files docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20User%20instruction%20files%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The custom instructions how-to describes path-specific files.
reportedIn:
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
  - "[Copilot docs add custom instructions to Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20add%20custom%20instructions%20to%20Copilot%20CLI.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Rules and steering files](../../subjects/instructions/Rules%20and%20steering%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Rule files are `*.instructions.md` files, and Claude Code rule files are read the same way. A file with an `applyTo` or `paths` value applies only to matching files.
