---
slug: gpt4all
category: model-runtime
vendor: Nomic AI
homepage: https://www.nomic.ai/gpt4all
docs: https://docs.gpt4all.io
repository: https://github.com/nomic-ai/gpt4all
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
checked: '2026-11-21'
sources:
- '[GPT4All Settings](../documents/Nomic%20AI/GPT4All%20Settings.md)'
- '[GPT4All gpt4all.py](../documents/Nomic%20AI/GPT4All%20gpt4all.py.md)'
---

GPT4All is a desktop chat app (with Python bindings) that runs GGUF models locally via llama.cpp. It downloads multi-GB model files into a per-user download path; the repository's last push was in May 2025.

## Open

- clean command: GPT4All has no CLI; no documented command removes models (removal is done in the app's Models page, which the docs found do not describe).
- inventory command: No documented command lists installed models or their sizes.
- in use: The app's process name and any lock files are not documented.
