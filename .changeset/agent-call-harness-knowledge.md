---
"@osdlc/agent-call": patch
---

A test now checks the adapters' hard-coded harness facts against the harness knowledge file, and each adapter notes in a `// knowledge:` comment which facts the file does not state yet. Behaviour is unchanged.
