---
proposition:
  subject: "[Antigravity](../../harnesses/Antigravity.md)"
  predicate: cli/session-persistence
  object:
    supported: true
    persists_by_default: true
    resumable_by_id: true
    store: ~/.gemini/antigravity-cli/brain/<conversationId>/.system_generated/logs/transcript.jsonl
    note: "the headless page calls runs stateless by default: a run starts without earlier context, yet it reports a conversation_id that --conversation resumes"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 headless conversation id](../../study-results/Antigravity/2026-11-09%20headless%20conversation%20id.md)"
      - "[2026-11-09 headless stateless and resume](../../study-results/Antigravity/2026-11-09%20headless%20stateless%20and%20resume.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless page gives each run a conversation_id for resuming later.
  - hasEvidenceItems:
      - "[2026-11-14 hooks transcript path](../../study-results/Antigravity/2026-11-14%20hooks%20transcript%20path.md)"
      - "[2026-11-14 hooks transcript location](../../study-results/Antigravity/2026-11-14%20hooks%20transcript%20location.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The hooks page gives the path of the persistent transcript.
  - hasEvidenceItems:
      - "[2026-11-14 changelog print mode leaves conversation](../../study-results/Antigravity/2026-11-14%20changelog%20print%20mode%20leaves%20conversation.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The 1.1.11 changelog says read-only slash commands in print mode leave no conversation behind, which implies other print runs do.
reportedIn:
  - "[Antigravity docs CLI headless mode](../../documents/antigravity.google/Antigravity%20docs%20CLI%20headless%20mode.md)"
  - "[Antigravity docs Hooks](../../documents/antigravity.google/Antigravity%20docs%20Hooks.md)"
  - "[Antigravity CLI CHANGELOG at f51cb8d](../../documents/Google/Antigravity%20CLI%20CHANGELOG%20at%20f51cb8d.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Antigravity](../../harnesses/Antigravity.md)"
subject: "[Session persistence](../../subjects/cli/Session%20persistence.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[Antigravity Session persistence](Antigravity%20Session%20persistence.md)"
open:
  - Is there a flag or setting that stops a run from saving its conversation?
---

The 2026-11-09 statement left open whether a headless conversation is stored. The docs give every run a `conversation_id` that a later run can resume, the hooks page calls the transcript persistent and gives its path under `~/.gemini/antigravity-cli`, and the changelog says only the read-only slash commands in print mode leave no conversation behind. No source read names a way to turn saving off.
