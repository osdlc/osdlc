---
proposition:
  subject: '[llama.cpp](../../stores/llama.cpp.md)'
  predicate: location/override
  object:
    vars:
    - LLAMA_CACHE
    - HF_HUB_CACHE
    - HUGGINGFACE_HUB_CACHE
    - HF_HOME
    - XDG_CACHE_HOME
    settings:
    - -m / --model
    - --models-dir
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 llama.cpp location overrides 1](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20location%20overrides%201.md)'
  - '[2026-11-21 llama.cpp location overrides 2](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20location%20overrides%202.md)'
  - '[2026-11-21 llama.cpp location overrides 3](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: LLAMA_CACHE takes precedence for both caches; the HF variables apply to the -hf cache;
    -m stores a download at an explicit path.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[llama.cpp](../../stores/llama.cpp.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

LLAMA_CACHE takes precedence for both caches; the HF variables apply to the -hf cache; -m stores a download at an explicit path.
