---
proposition:
  subject: '[llama.cpp](../../stores/llama.cpp.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: DELETE /models?model={name} (llama-server router API)
      removes: a cached model (keeping files another cached quant still uses)
    - command: hf cache rm <repo-id>
      removes: a cached repo, since -hf downloads share the huggingface_hub cache
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 llama.cpp clean command 1](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20clean%20command%201.md)'
  - '[2026-11-21 llama.cpp clean command 2](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20clean%20command%202.md)'
  - '[2026-11-21 llama.cpp clean command 3](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: llama.cpp has no CLI delete command; the server router exposes DELETE /models for cached
    models, and because the cache is the huggingface_hub cache (the source says its lock file is shared
    with huggingface_hub) the hf cache tools also apply.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[llama.cpp](../../stores/llama.cpp.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Using `hf cache rm` on llama.cpp downloads is an inference from the shared layout, not documented by
  llama.cpp.
---

llama.cpp has no CLI delete command; the server router exposes DELETE /models for cached models, and because the cache is the huggingface_hub cache (the source says its lock file is shared with huggingface_hub) the hf cache tools also apply.
