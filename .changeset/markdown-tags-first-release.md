---
'@osdlc/markdown-tags': minor
---

First release. The TypeScript twin of the Rust `markdown-tags` crate (0.4.0): `inlineTags` and `extractBoth` in three dialects, `obsidian` (the default), `unicode` and `ascii`; `tagAt` for one tag at a UTF-16 offset; and `TagDialect`, `TAG_DIALECTS`, `DEFAULT_TAG_DIALECT` and `isTagDialect`. An unknown dialect from a JavaScript caller throws a `RangeError` that names the accepted ones, where `inlineTags` returned `undefined` and `tagAt` threw a `TypeError`. The `obsidian` dialect stops reading a tag inside a link or image destination or after a reference definition. `package.json` was set to 0.3.0 by hand so the package joins the crate on 0.4 and skips 0.1 to 0.3.
