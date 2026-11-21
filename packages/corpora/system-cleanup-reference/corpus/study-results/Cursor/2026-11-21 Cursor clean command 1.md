---
kind: docs
store: '[Cursor](../../stores/Cursor.md)'
observed: '2026-11-21'
locator: Clean up agent chat history
reportedIn:
- '[Installation and startup](../../documents/Anysphere/Installation%20and%20startup.md)'
excerpt:
  exact: Running Delete Old Chats on its own often removes the entries but leaves the file the same size
    on disk. GC Agent KV Blobs is what compacts the file back down.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Installation and startup (https://cursor.com/help/troubleshooting/install-issues.md) says, under Clean up agent chat history:

> Running Delete Old Chats on its own often removes the entries but leaves the file the same size on disk. GC Agent KV Blobs is what compacts the file back down.
