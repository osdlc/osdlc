---
proposition:
  subject: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
  predicate: liveness/in-use
  object:
    processes: []
    locks:
    - ~/.cache/huggingface/hub/.locks
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Hugging Face Hub in use 1](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20in%20use%201.md)'
  - '[2026-11-21 Hugging Face Hub in use 2](../../study-results/Hugging%20Face%20Hub/2026-11-21%20Hugging%20Face%20Hub%20in%20use%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: huggingface_hub is a library with no daemon; downloads take file locks under <cache_dir>/.locks
    and leave .incomplete files while in progress.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Any Python process (transformers, diffusers, etc.) can be using the cache; no process name identifies
  it.
---

huggingface_hub is a library with no daemon; downloads take file locks under <cache_dir>/.locks and leave .incomplete files while in progress.
