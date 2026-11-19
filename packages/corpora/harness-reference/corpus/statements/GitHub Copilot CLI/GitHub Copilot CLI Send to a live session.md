---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: cli/send-to-live
  object:
    supported: partial
    mechanism: "remote control: after `/remote on` in the session, it can be steered from GitHub.com or GitHub Mobile"
    note: remote control is disabled by default; `--connect[=SESSION-ID]` connects to a remote session
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Remote control docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Remote%20control%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Remote control slash command docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Remote%20control%20slash%20command%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Remote control default docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Remote%20control%20default%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The remote control page describes steering a running session from another device.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Connect option docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Connect%20option%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The command reference lists the option.
reportedIn:
  - "[Copilot docs steering a Copilot CLI session remotely](../../documents/docs.github.com/Copilot%20docs%20steering%20a%20Copilot%20CLI%20session%20remotely.md)"
  - "[Copilot docs CLI command reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20command%20reference.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Send to a live session](../../subjects/cli/Send%20to%20a%20live%20session.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is there a local command or flag that delivers a message to a session running in another terminal?
---

A running session can be steered from GitHub.com or GitHub Mobile once remote control is on. The value is partial because the session must opt in first. No source read shows a local command that sends one message to a running session.
