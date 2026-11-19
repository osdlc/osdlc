---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    acp: "gemini --acp: the client's prompt method on a held-open process, JSON-RPC over stdio"
    limit: only a process the client started in ACP mode, since the transport is stdio
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI ACP prompt method docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20ACP%20prompt%20method%20docs.md)"
      - "[2026-11-14 Gemini CLI ACP mode transport docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20ACP%20mode%20transport%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: ACP mode and its prompt method."
reportedIn:
  - "[google-gemini gemini-cli docs cli acp-mode.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20cli%20acp-mode.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Can a message reach an interactive session that another process started? The docs name none; the source was not searched for one.
---

A client that starts `gemini --acp` can send prompts to its sessions with the `prompt` method. The docs name no way to reach a session running in another process, such as an open terminal session.

Open questions:
- Can a message reach an interactive session that another process started? The docs name none; the source was not searched for one.
