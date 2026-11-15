---
from: "[markdown-store](../components/markdown-store.md)"
to: "[markdown-vault-fs](../components/markdown-vault-fs.md)"
overlap: partial
states: [present, target]
note: >-
  markdown-store's walk.rs walks folders with the ignore crate instead of markdown-vault-fs; the
  plan only says it moves to the shared note parts.
---
