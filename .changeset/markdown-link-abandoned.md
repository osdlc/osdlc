---
'@osdlc/markdown-link': minor
---

New: `scanBodyWith(body, options)` returns `{ links, abandoned }`. `links` is what `bodyLinksSpannedWith` returns. `abandoned` lists each `[[` the scan found outside code and did not read as a link, as an `AbandonedLink` with `reason`, `embed`, `start` and `end`, so a caller can flag link syntax left in the text. The reasons (`AbandonReason`) are `'bracket'` (a `[` or `]` before the closing `]]`), `'code'` (the target is only code), `'empty-target'` (`[[]]`, `[[ |alias]]`, or `[[#Heading]]` without `selfLinks`) and `'unclosed'`. A run of `[` with no link after it, such as `[[[TODO`, is one entry: from the first `[[`, with the reason and end of the last. Matches the Rust crate's `scan_body_with`. This release is 0.8.0: `package.json` was set to 0.7.0 by hand so the package joins the Rust crate on 0.8 and skips 0.7.
