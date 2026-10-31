# @osdlc/markdown-link

## 0.5.0

### Minor Changes

- 5aecf76: First release. The TypeScript twin of the parsing half of the Rust `markdown-link` crate, with no dependencies: `stripCode` and `stripCodeWith`, the code lexer under CommonMark and skill-export rules; `parseInner` and `targetRange` for one wikilink body; `isVaultLinkUrl` and `mdLinkTarget` for markdown link URLs; `bodyLinksSpanned` and `bodyLinks`, which find every wikilink, embed and relative markdown link in a body, each with its `alias`; `displayText`, which shows each link as a reader sees it; `parseTypedRef` for a whole `[[type/slug|Alias]]` value; and `ATTACHMENT_EXTENSIONS`. Spans and ranges are UTF-16 offsets. Its tests read the crate's `tests/fixtures/conformance.json`, so the two agree on every case in it.
