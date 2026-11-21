---
kind: docs
store: '[Hugging Face Hub](../../stores/Hugging%20Face%20Hub.md)'
observed: '2026-11-21'
locator: Clean your cache
reportedIn:
- '[Understand caching](../../documents/Hugging%20Face/Understand%20caching.md)'
excerpt:
  exact: 'To clean up cache garbage in bulk, run `hf cache prune`. It automatically deletes revisions
    that are no longer referenced by a branch or tag, leftover `.incomplete` files from interrupted downloads,
    and shared blobs that no cached repo references anymore:'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Understand caching (https://raw.githubusercontent.com/huggingface/huggingface_hub/main/docs/source/en/guides/manage-cache.md) says, under Clean your cache:

> To clean up cache garbage in bulk, run `hf cache prune`. It automatically deletes revisions that are no longer referenced by a branch or tag, leftover `.incomplete` files from interrupted downloads, and shared blobs that no cached repo references anymore:
