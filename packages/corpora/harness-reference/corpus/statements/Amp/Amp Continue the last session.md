---
proposition:
  subject: "[Amp](../../harnesses/Amp.md)"
  predicate: cli/continue
  object:
    supported: true
    argv:
      - threads
      - continue
    chosen_by: the most recent thread
    accepts_prompt: true
    note: "The docs show `amp threads continue --execute <prompt>` with no thread id. The SDK option `continue: true` is described as continuing the most recent thread; the CLI page does not say how the thread is picked."
direction: supports
strength: weak
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 threads continue without an id](../../study-results/Amp/2026-11-14%20threads%20continue%20without%20an%20id.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The streaming JSON page continues a thread with no id on the command line.
  - hasEvidenceItems:
      - "[2026-11-14 sdk continue most recent thread](../../study-results/Amp/2026-11-14%20sdk%20continue%20most%20recent%20thread.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The SDK reference says its continue option with no id continues the most recent thread.
reportedIn:
  - "[Amp docs Streaming JSON](../../documents/ampcode.com/Amp%20docs%20Streaming%20JSON.md)"
  - "[Amp docs SDK TypeScript](../../documents/ampcode.com/Amp%20docs%20SDK%20TypeScript.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Amp](../../harnesses/Amp.md)"
subject: "[Continue the last session](../../subjects/cli/Continue%20the%20last%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Weak because the link between the CLI command and "most recent" is made through the SDK reference, not stated on a CLI page.
