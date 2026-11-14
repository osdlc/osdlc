---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/relative-paths
  object:
    model_told_location: true
    tells_model: the system prompt lists each skill's SKILL.md path in <location>; activation returns the skill folder's tree in <available_resources> and adds the folder to the workspace
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI skill list in system prompt source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20list%20in%20system%20prompt%20source.md)"
      - "[2026-11-14 Gemini CLI skill activation output source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20activation%20output%20source.md)"
      - "[2026-11-14 Gemini CLI skill directory added to workspace source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20skill%20directory%20added%20to%20workspace%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the location tag in the system prompt, the activation output, and the skill directory added to the workspace."
reportedIn:
  - "[google-gemini gemini-cli core src prompts snippets.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20prompts%20snippets.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli core src tools activate-skill.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20tools%20activate-skill.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Relative paths in SKILL.md](../../subjects/skills/Relative%20paths%20in%20SKILL.md.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Which folder does a relative path in the SKILL.md body resolve from in practice, and does the model follow it? No run was made.
---

The harness tells the model where each skill is and what its folder holds. No source says which folder a relative path in the body resolves from.

Open questions:
- Which folder does a relative path in the SKILL.md body resolve from in practice, and does the model follow it? No run was made.
