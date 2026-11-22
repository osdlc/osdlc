---
proposition:
  subject: '[llama.cpp](../../stores/llama.cpp.md)'
  predicate: liveness/in-use
  object:
    processes:
    - llama-server
    - llama
    locks:
    - ~/.cache/huggingface/hub/.locks
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 llama.cpp in use 1](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20in%20use%201.md)'
  - '[2026-11-21 llama.cpp in use 2](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20in%20use%202.md)'
  - '[2026-11-21 llama.cpp in use 3](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20in%20use%203.md)'
  - '[2026-11-21 llama.cpp in use 4](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20in%20use%204.md)'
  - '[2026-11-21 llama.cpp in use 5](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20in%20use%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Downloads take per-blob lock files under the hub cache's .locks directory, the same lock
    files huggingface_hub uses; the server refuses to delete a model that is running or downloading.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[llama.cpp](../../stores/llama.cpp.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Downloads take per-blob lock files under the hub cache's .locks directory, the same lock files huggingface_hub uses; the server refuses to delete a model that is running or downloading.
