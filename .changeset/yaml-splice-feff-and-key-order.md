---
"@osdlc/yaml-splice": patch
---

A mapping passed as a `Set` value now keeps its key order. It was written with its keys sorted. A key or value that starts with U+FEFF is now written double-quoted, with U+FEFF escaped. Written plain at the start of a document, it was read back as a byte-order mark and dropped. A `Remove` that would move such a line to the start of a document is now refused as `InvalidResult`.
