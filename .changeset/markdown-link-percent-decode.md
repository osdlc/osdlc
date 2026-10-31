---
"@osdlc/markdown-link": minor
---

Export `percentDecode`, the decoding `mdLinkTarget` already uses, as the Rust crate exports `percent_decode`. Each valid `%XX` decodes on its own, a `%` that is not valid hex stays as written, and a result that is not UTF-8 leaves the whole string as written.
