# @osdlc/markdown-link

## 0.11.1

### Patch Changes

- 7f231dd: Docs: the `allMarkdownLinks` option gives the `[x](#h)` example the Rust crate gives: a link to a heading in the same note targets `#h`.

## 0.11.0

### Minor Changes

- c2c14f1: **Breaking:** markdown link destinations are read much as CommonMark reads an inline link, so more links are found. A title in `"…"`, `'…'` or `(…)` may follow the URL (`[a](a.md "Hint")`), parentheses that balance may sit in the URL (`[Notes](notes/Foo%20(beta).md)`), a `<…>` URL may hold spaces (`[c](<sp ace.md>)`), and whitespace may come around the URL and title. Unlike CommonMark, a title stays on one line, and no line break comes before an unbracketed URL. A Markdown link that is not kept is stepped over whole, so a `[[x]]` in its title is not a wikilink. Two links are no longer read: one with unbalanced parentheses in the URL, and one starting with `//`, which names a host. New: `BodyLink.title` holds a markdown link's title as written (`null` for none and for wikilinks), and `ScanOptions.allMarkdownLinks` reads every relative inline Markdown link whatever its target, such as a `.yaml` file or a folder. Matches the Rust crate's 0.11.0.

## 0.10.0

### Minor Changes

- 8694223: **Breaking:** more of a body counts as code, so fewer links are found in it. `stripCode` and every scanner also treat these as code: indented code (a line indented four or more columns past its block's text, unless it continues a paragraph), math (`$$…$$` in its block, and `$…$` on one line; a `$` right after a letter or digit opens none), `<pre>`, `<script>`, `<style>` and `<textarea>` blocks, and autolinks such as `<https://example.com>`. A fence may now sit in a list item, and ends with the item. A span or `$$` stops at a line that opens a fence or raw HTML block. An HTML comment is found in the same left-to-right pass as code, so a backtick, `$` or fence inside a comment no longer opens code, and a comment later in a line stays in its block, as a span does. A Markdown link's text may hold brackets that balance (`[[WIP] Fix](fix.md)` is a link), but not `[[`, another link or a blank line, and its destination is read as written (`[a](notes/$x$.md)` is a link). `scanBodyWith` no longer reports a `[[` whose first or second `[` opens a Markdown link (an inline link of any URL, or a reference link whose label the body defines). New: `codeRanges(text, rules)` returns the ranges that are code, and `splitAlias` is exported. Matches the Rust crate's 0.10.0.

## 0.9.0

### Minor Changes

- e7a4300: Fixed: under `'commonmark'` a fenced code block inside a list item or a block quote is code, so the links after it are found. A fence opens when it is indented to its item's content column (`10. item` then a fence at column 4), and an unclosed fence runs to the end of its container, not of the body. A code span inside a table row now stays in its cell: a `|` that is not escaped as `\|` ends the cell, backticks or not, so ``| `a | [[x]] | b` |`` finds `[[x]]` where the scan took the rest of the body for code. `'skill-export'` is unchanged. Lazy continuation lines are not tracked, so a paragraph line that is not indented to its list item ends the item here.
  
  Changed: `\![[Note]]`, an escaped `!` before a wikilink, is a `'wikilink'` whose span starts at the `[[`, with `embed: false` on an abandoned one, so a renderer can show a literal `!` and a normal link. It was an `'embed'` starting at the `!`. `\\![[Note]]` is still an embed.
  
  New: `codeRules: 'none'` in `ScanOptions` and `stripCodeWith` finds no code, for a caller that has already parsed it, such as remark, and scans a run of text. `CodeRules` gains `'none'`. The shared suite moves to `packages/conformance/markdown-link/suite.json`, with cases for all three, and matches the `markdown-link` crate.

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
