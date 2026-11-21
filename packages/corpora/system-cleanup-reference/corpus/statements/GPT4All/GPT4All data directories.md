---
proposition:
  subject: '[GPT4All](../../stores/GPT4All.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: windows
      path: C:\Users\{username}\AppData\Local\nomic.ai\GPT4All
      holds: models
      rebuild: re-download
    - platform: macos
      path: ~/Library/Application Support/nomic.ai/GPT4All
      holds: models
      rebuild: re-download
    - platform: linux
      path: ~/.local/share/nomic.ai/GPT4All
      holds: models
      rebuild: re-download
    - platform: all
      path: ~/.cache/gpt4all
      holds: models
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 GPT4All data directories 1](../../study-results/GPT4All/2026-11-21%20GPT4All%20data%20directories%201.md)'
  - '[2026-11-21 GPT4All data directories 2](../../study-results/GPT4All/2026-11-21%20GPT4All%20data%20directories%202.md)'
  - '[2026-11-21 GPT4All data directories 3](../../study-results/GPT4All/2026-11-21%20GPT4All%20data%20directories%203.md)'
  - '[2026-11-21 GPT4All data directories 4](../../study-results/GPT4All/2026-11-21%20GPT4All%20data%20directories%204.md)'
  - '[2026-11-21 GPT4All data directories 5](../../study-results/GPT4All/2026-11-21%20GPT4All%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The desktop settings page gives the default Download Path per platform; the Python bindings
    default to ~/.cache/gpt4all. Models downloaded from the app's catalogue can be fetched again; GGUF
    files a user placed there by hand are not tracked separately.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[GPT4All](../../stores/GPT4All.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Whether chats and LocalDocs databases share the download path, and so would be lost with it, is not
  documented.
- The docs give no way to tell a sideloaded model from a downloaded one.
---

The desktop settings page gives the default Download Path per platform; the Python bindings default to ~/.cache/gpt4all. Models downloaded from the app's catalogue can be fetched again; GGUF files a user placed there by hand are not tracked separately.
