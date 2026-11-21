---
kind: docs
store: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
observed: '2026-11-21'
locator: XDG_CACHE_HOME
reportedIn:
- '[Environment variables 3](../../documents/Hugging%20Face/Environment%20variables%203.md)'
excerpt:
  exact: If `HF_HOME` is not set, the default home will be `"$XDG_CACHE_HOME/huggingface"` instead of
    `"~/.cache/huggingface"`.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Environment variables 3 (https://raw.githubusercontent.com/huggingface/huggingface_hub/main/docs/source/en/package_reference/environment_variables.md) says, under XDG_CACHE_HOME:

> If `HF_HOME` is not set, the default home will be `"$XDG_CACHE_HOME/huggingface"` instead of `"~/.cache/huggingface"`.
