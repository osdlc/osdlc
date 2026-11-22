---
proposition:
  subject: '[llama.cpp](../../stores/llama.cpp.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.cache/huggingface/hub
      holds: models
      rebuild: re-download
    - platform: linux
      path: ~/.cache/huggingface/hub
      holds: models
      rebuild: re-download
    - platform: windows
      path: '%USERPROFILE%\.cache\huggingface\hub'
      holds: models
      rebuild: re-download
    - platform: macos
      path: ~/Library/Caches/llama.cpp
      holds: cache
      rebuild: re-download
    - platform: linux
      path: $XDG_CACHE_HOME/llama.cpp
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.cache/llama.cpp
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\llama.cpp'
      holds: cache
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 llama.cpp data directories 1](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20data%20directories%201.md)'
  - '[2026-11-21 llama.cpp data directories 2](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20data%20directories%202.md)'
  - '[2026-11-21 llama.cpp data directories 3](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20data%20directories%203.md)'
  - '[2026-11-21 llama.cpp data directories 4](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20data%20directories%204.md)'
  - '[2026-11-21 llama.cpp data directories 5](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20data%20directories%205.md)'
  - '[2026-11-21 llama.cpp data directories 6](../../study-results/llama.cpp/2026-11-21%20llama.cpp%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Source code (hf-cache.cpp) resolves the -hf model cache as LLAMA_CACHE, HF_HUB_CACHE, HUGGINGFACE_HUB_CACHE,
    HF_HOME/hub, XDG_CACHE_HOME/huggingface/hub, then HOME (USERPROFILE on Windows)/.cache/huggingface/hub;
    common.cpp's separate llama.cpp cache dir (used for -dr Docker model downloads and the RPC cache)
    is Library/Caches on macOS, XDG_CACHE_HOME or ~/.cache on Linux and LOCALAPPDATA on Windows. Models
    passed with -m are the user's own files and are not in either cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[llama.cpp](../../stores/llama.cpp.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Whether files downloaded to ~/.cache/llama.cpp by older llama.cpp releases (before the switch to the
  HF cache layout) are migrated or left behind is not documented; such leftover .gguf files would be re-downloadable.
---

Source code (hf-cache.cpp) resolves the -hf model cache as LLAMA_CACHE, HF_HUB_CACHE, HUGGINGFACE_HUB_CACHE, HF_HOME/hub, XDG_CACHE_HOME/huggingface/hub, then HOME (USERPROFILE on Windows)/.cache/huggingface/hub; common.cpp's separate llama.cpp cache dir (used for -dr Docker model downloads and the RPC cache) is Library/Caches on macOS, XDG_CACHE_HOME or ~/.cache on Linux and LOCALAPPDATA on Windows. Models passed with -m are the user's own files and are not in either cache.
