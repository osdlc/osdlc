---
kind: source
store: '[GPT4All](../../stores/GPT4All.md)'
observed: '2026-11-21'
locator: DEFAULT_MODEL_DIRECTORY
reportedIn:
- '[GPT4All gpt4all.py](../../documents/Nomic%20AI/GPT4All%20gpt4all.py.md)'
excerpt:
  exact: DEFAULT_MODEL_DIRECTORY = Path.home() / ".cache" / "gpt4all"
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

GPT4All gpt4all.py (https://raw.githubusercontent.com/nomic-ai/gpt4all/main/gpt4all-bindings/python/gpt4all/gpt4all.py) says, under DEFAULT_MODEL_DIRECTORY:

> DEFAULT_MODEL_DIRECTORY = Path.home() / ".cache" / "gpt4all"
