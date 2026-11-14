---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: instructions/rules
  object:
    supported: true
    dir: .agents/rules
    user_dir: ~/.gemini/config/rules
    attach_by: "frontmatter `trigger`: always_on, model_decision (by `description`), glob (by `globs`) or manual (an @ mention)"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 rules directory-scoped files](../../study-results/Antigravity/2026-11-14%20rules%20directory-scoped%20files.md)"
      - "[2026-11-14 rules modular global rules](../../study-results/Antigravity/2026-11-14%20rules%20modular%20global%20rules.md)"
      - "[2026-11-14 rules trigger key](../../study-results/Antigravity/2026-11-14%20rules%20trigger%20key.md)"
      - "[2026-11-14 rules frontmatter required](../../study-results/Antigravity/2026-11-14%20rules%20frontmatter%20required.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The rules page describes the rules folders and the trigger key.
reportedIn:
  - "[Antigravity docs Rules](../../documents/antigravity.google/Antigravity%20docs%20Rules.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Rules and steering files](../../subjects/instructions/Rules%20and%20steering%20files.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Each `.md` file directly inside a rules folder must start with frontmatter that sets `trigger`. A file without it, or with an unknown value, is dropped silently. Nested files load only when `.agents/rules.json` names them.
