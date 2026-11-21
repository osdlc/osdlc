---
proposition:
  subject: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: hf cache rm <repo-id or revision>
      removes: the given cached repositories or revisions
    - command: hf cache prune
      removes: revisions no branch or tag references, leftover .incomplete downloads, and shared blobs
        no cached repo uses
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Hugging Face Hub clean command 1](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20clean%20command%201.md)'
  - '[2026-11-21 Hugging Face Hub clean command 2](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The cache guide documents `hf cache rm` and `hf cache prune` (both take --dry-run / -y).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The current docs do not mention the legacy `huggingface-cli scan-cache` / `delete-cache` commands; whether
  they still ship was not settled.
---

The cache guide documents `hf cache rm` and `hf cache prune` (both take --dry-run / -y).
