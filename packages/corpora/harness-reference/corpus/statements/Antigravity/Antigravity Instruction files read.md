---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: instructions/files
  object:
    files:
      - AGENTS.md
      - GEMINI.md
      - .agents/AGENTS.md
      - .agents/GEMINI.md
      - .agents/rules/*.md
      - ~/.gemini/AGENTS.md
      - ~/.gemini/GEMINI.md
      - ~/.gemini/config/AGENTS.md
      - ~/.gemini/config/GEMINI.md
      - ~/.gemini/config/rules/*.md
    walk: the workspace folder and each parent folder up to the repository root; subfolders below the workspace folder are not searched
    budget: 24,000 bytes per file; 20,000 tokens for all global and always_on rules
    note: a file in a rules folder needs frontmatter with a valid trigger, and is always loaded only when the trigger is always_on; the legacy .agent/rules folder is read too
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 rules directory-scoped files](../../study-results/Antigravity/2026-11-14%20rules%20directory-scoped%20files.md)"
      - "[2026-11-14 rules agents folder files](../../study-results/Antigravity/2026-11-14%20rules%20agents%20folder%20files.md)"
      - "[2026-11-14 rules global files](../../study-results/Antigravity/2026-11-14%20rules%20global%20files.md)"
      - "[2026-11-14 rules modular global rules](../../study-results/Antigravity/2026-11-14%20rules%20modular%20global%20rules.md)"
      - "[2026-11-14 rules no subfolders](../../study-results/Antigravity/2026-11-14%20rules%20no%20subfolders.md)"
      - "[2026-11-14 rules frontmatter required](../../study-results/Antigravity/2026-11-14%20rules%20frontmatter%20required.md)"
      - "[2026-11-14 rules per-file limit](../../study-results/Antigravity/2026-11-14%20rules%20per-file%20limit.md)"
      - "[2026-11-14 rules token budget](../../study-results/Antigravity/2026-11-14%20rules%20token%20budget.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The rules page lists the files, the folders searched and the size limits.
reportedIn:
  - "[Antigravity docs Rules](../../documents/antigravity.google/Antigravity%20docs%20Rules.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Instruction files read](../../subjects/instructions/Instruction%20files%20read.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Rules are cumulative: Antigravity loads every file it finds and none replaces another. A rule file over 24,000 bytes is truncated, and when the global and `always_on` rules pass 20,000 tokens the largest are replaced by a pointer the agent can read on demand.
