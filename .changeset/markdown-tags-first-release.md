---
'@osdlc/markdown-tags': minor
---

First release. The TypeScript twin of the Rust `markdown-tags` crate (0.4.0): `inlineTags` and `extractBoth` in three dialects, `obsidian` (the default), `unicode` and `ascii`; `tagAt` for one tag at a UTF-16 offset; and `TagDialect`, `TAG_DIALECTS`, `DEFAULT_TAG_DIALECT` and `isTagDialect`. The `obsidian` dialect stops reading a tag inside a link or image destination or after a reference definition.
