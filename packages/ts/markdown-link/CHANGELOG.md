# @osdlc/markdown-link

## 0.8.1

### Patch Changes

- 59e529e: `stripCode`: under `'commonmark'` a backtick after an odd run of `\` is a literal backtick and opens no code span, so a link in ``See \`[[Note]]\` here`` is found. `'skill-export'` does not honour the escape, as before. `displayText` shows a link into the same note, `[[#Setup|steps]]` or `[[#Setup]]`, as its alias, or else its heading or `^block`, where it dropped the link. Both match the `markdown-link` crate, and the shared `conformance.json` has cases for them.

## 0.8.0

### Minor Changes

- 96a1bd2: New: `scanBodyWith(body, options)` returns `{ links, abandoned }`. `links` is what `bodyLinksSpannedWith` returns. `abandoned` lists each `[[` the scan found outside code and did not read as a link, as an `AbandonedLink` with `reason`, `embed`, `start` and `end`, so a caller can flag link syntax left in the text. The reasons (`AbandonReason`) are `'bracket'` (a `[` or `]` before the closing `]]`), `'code'` (the target is only code), `'empty-target'` (`[[]]`, `[[ |alias]]`, or `[[#Heading]]` without `selfLinks`) and `'unclosed'`. A run of `[` with no link after it, such as `[[[TODO`, is one entry: from the first `[[`, with the reason and end of the last. Matches the Rust crate's `scan_body_with`. This release is 0.8.0: `package.json` was set to 0.7.0 by hand so the package joins the Rust crate on 0.8 and skips 0.7.
- 3623b05: **Breaking:** a `#^id` fragment is now a block, not a heading. `parseInner('Note#^abc', false)` gives `heading: null` and `block: 'abc'`, where it gave `heading: '^abc'`. `WikiLink` and `BodyLink` gain `block` and `size` (an embed's `|300` or `|300x200`, as `{ width, height }`; the alias still holds it as written), and `BodyLink` gains `heading`. New: `bodyLinksSpannedWith(body, options)` with `ScanOptions` (`codeRules`, `skipHtmlComments`, `selfLinks`, all off or CommonMark by default, so `bodyLinksSpanned` is unchanged), `parseInnerSelf` (reads `#Heading` as a link to the note it is in, with an empty target), `isSizeSpec` and `parseSize`. Released together with `scanBodyWith` as 0.8.0, which matches the Rust crate's 0.8.0; there is no 0.7.0 of this package.

### Patch Changes

- 96a1bd2: Fixed: `percentDecode` takes an escape only when both characters after `%` are hex digits, so `%+5` stays as written instead of decoding. It had copied a quirk of Rust's `u8::from_str_radix`, which accepts a sign; the Rust crate's `percent_decode` is fixed the same way.

## 0.6.0

### Minor Changes

- 743c7bf: Export `percentDecode`, the decoding `mdLinkTarget` already uses, as the Rust crate exports `percent_decode`. Each valid `%XX` decodes on its own, a `%` that is not valid hex stays as written, and a result that is not UTF-8 leaves the whole string as written.

## 0.5.0

### Minor Changes

- 5aecf76: First release. The TypeScript twin of the parsing half of the Rust `markdown-link` crate, with no dependencies: `stripCode` and `stripCodeWith`, the code lexer under CommonMark and skill-export rules; `parseInner` and `targetRange` for one wikilink body; `isVaultLinkUrl` and `mdLinkTarget` for markdown link URLs; `bodyLinksSpanned` and `bodyLinks`, which find every wikilink, embed and relative markdown link in a body, each with its `alias`; `displayText`, which shows each link as a reader sees it; `parseTypedRef` for a whole `[[type/slug|Alias]]` value; and `ATTACHMENT_EXTENSIONS`. Spans and ranges are UTF-16 offsets. Its tests read the crate's `tests/fixtures/conformance.json`, so the two agree on every case in it.
