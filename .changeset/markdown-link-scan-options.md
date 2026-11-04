---
'@osdlc/markdown-link': minor
---

**Breaking:** a `#^id` fragment is now a block, not a heading. `parseInner('Note#^abc', false)` gives `heading: null` and `block: 'abc'`, where it gave `heading: '^abc'`. `WikiLink` and `BodyLink` gain `block` and `size` (an embed's `|300` or `|300x200`, as `{ width, height }`; the alias still holds it as written), and `BodyLink` gains `heading`. New: `bodyLinksSpannedWith(body, options)` with `ScanOptions` (`codeRules`, `skipHtmlComments`, `selfLinks`, all off or CommonMark by default, so `bodyLinksSpanned` is unchanged), `parseInnerSelf` (reads `#Heading` as a link to the note it is in, with an empty target), `isSizeSpec` and `parseSize`. Matches the Rust crate's 0.7.0.
