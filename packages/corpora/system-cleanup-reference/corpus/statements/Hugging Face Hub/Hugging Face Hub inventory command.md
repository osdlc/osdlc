---
proposition:
  subject: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: hf cache ls
      shows: cached repos with size, last accessed and last modified
    - command: hf cache ls --revisions
      shows: each cached revision
    - command: hf cache verify <repo-id>
      shows: whether cached files match the Hub checksums
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Hugging Face Hub inventory command 1](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20inventory%20command%201.md)'
  - '[2026-11-21 Hugging Face Hub inventory command 2](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The cache guide documents `hf cache ls` (with filters such as size>1GB and accessed>30d)
    and `hf cache verify`.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The cache guide documents `hf cache ls` (with filters such as size>1GB and accessed>30d) and `hf cache verify`.
