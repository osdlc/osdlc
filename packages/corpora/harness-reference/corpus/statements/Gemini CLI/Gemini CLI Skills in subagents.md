---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: skills/subagent-visibility
  object:
    supported: "true"
    can_load_skills: true
    startup: the skill list (name, description, location) is added to the subagent's system prompt when it has the activate_skill tool
    disable_with: give the agent a tool list without activate_skill
    note: an agent with no tool list gets all of the parent's tools
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI subagent skill list source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20subagent%20skill%20list%20source.md)"
      - "[2026-11-14 Gemini CLI subagent default tools source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20subagent%20default%20tools%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the local agent executor adds the skill list when activate_skill is registered, and registers every parent tool when the agent names none."
reportedIn:
  - "[google-gemini gemini-cli core src agents local-executor.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20core%20src%20agents%20local-executor.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Skills in subagents](../../subjects/skills/Skills%20in%20subagents.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Gemini CLI Skills in subagents open](Gemini%20CLI%20Skills%20in%20subagents%20open.md)"
open:
  - Does a subagent see skills the parent already activated? Not checked.
---

A local subagent sees the same skill list as the session when it has the `activate_skill` tool, which it has by default.

Open questions:
- Does a subagent see skills the parent already activated? Not checked.
