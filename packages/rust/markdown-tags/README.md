# markdown-tags

Inline `#tag` lexing for Markdown note bodies, in three dialects. Tools
disagree on what an inline tag is, and no common reading is a superset of
another, so this crate implements three and keeps them apart.

| | `TagDialect::Obsidian` | `TagDialect::Unicode` | `TagDialect::Ascii` |
|---|---|---|---|
| alphabet | any Unicode alphabetic char or number, `_`, `/`, `-` | the same | ASCII letters and digits, `_`, `/`, `-` |
| must hold | one char that is not a number | anything | a letter or `_` first |
| preceded by | start, whitespace or `(` | start or whitespace | start, whitespace or `(` |
| code spans and fences | blanked first | scanned | blanked first |
| link destinations and reference definitions | blanked first | scanned | scanned |

| note text | Obsidian | Unicode | Ascii |
|---|---|---|---|
| `#2024-review` | `2024-review` | `2024-review` | none |
| `#2024` | none | `2024` | none |
| `#santé` | `santé` | `santé` | `sant` |
| `(#draft)` | `draft` | none | `draft` |
| a fenced block holding `#nottag` | none | `nottag` | none |

`Obsidian` is the default. It is the rule the `@sksizer/markdown-render` renderer
applies, read from the source text:

```text
(^|[\s(])#([\p{Alphabetic}\p{N}_/-]*[\p{Alphabetic}_/-][\p{Alphabetic}\p{N}_/-]*)
```

The tag is the longest run of tag characters after `#`. The run must hold one
character that is `\p{Alphabetic}`, `_`, `/` or `-`, so `#1` and `#2024` are
not tags, `#2024-review` and `#-` are. A number here is `\p{N}`, so `²` and `½`
do not count, while a Roman numeral such as `Ⅻ` is also alphabetic and does.
`\s` is JavaScript's, which counts U+FEFF and not U+0085; the other two
dialects use `char::is_whitespace`, which is the other way round.

The renderer reads the syntax tree, so it can differ from any source scan.
The case file marks these cases `rendererOnly`:

- A `#` right after inline markup, as in `**bold**#tag` or `~~s~~#tag`, starts
  a text node and is a tag there. A source scan finds nothing.
- An entity the renderer decodes to whitespace, as in `a&nbsp;#tag`, makes a
  tag there. A source scan finds nothing.
- Link text is never tagged. A source scan finds `#tag` in `[text #tag](url)`.

Link and image destinations and reference definitions are not text to the
renderer, so it finds no tag in `[see](#section)`, `![alt](#img)` or
`[x]: #def`. `Obsidian` blanks them after code, so it agrees. `Unicode` and
`Ascii` scan them: `(` opens an `Ascii` tag, and a definition's `#` follows a
space. The blanking is a source approximation: a destination is the balanced
`(...)` after a `]` that closes an open `[` in the same paragraph, and a
definition is a `[label]:` line (not a `[^footnote]:`) that starts the text,
follows a blank line or follows another definition.

Use `Obsidian` where the answer must match what a reader sees. Use `Unicode`
where losing a tag is the worse mistake (a search index). Use `Ascii` where a
tag read out of a code sample is the worse mistake (a link graph).

`TagDialect` prints as and parses from `obsidian`, `unicode` and `ascii`, so a
setting value can name one.

```rust
use markdown_tags::{TagDialect, extract_both, inline_tags};

let body = "#santé and (#draft)";
assert_eq!(inline_tags(body, TagDialect::default()), vec!["santé", "draft"]);
assert_eq!(inline_tags(body, TagDialect::Unicode), vec!["santé"]);
assert_eq!(inline_tags(body, TagDialect::Ascii), vec!["sant", "draft"]);
assert_eq!("unicode".parse::<TagDialect>(), Ok(TagDialect::Unicode));

let (unicode, ascii) = extract_both(body);
```

Tags come back in encounter order and are not deduplicated. Code blanking is
[`markdown-link`](https://github.com/osdlc/osdlc/tree/main/packages/rust/markdown-link)'s
`strip_code`, so links and tags agree on what counts as code.

## TypeScript twin

`@sksizer/markdown-tags` (`packages/ts/markdown-tags` in the
[monorepo](https://github.com/sksizer/dev)) has the same three dialects and the
same answers. Both suites read `tests/fixtures/conformance.json`, which gives
each case's tags in every dialect, so a change on one side that the other does
not make fails a suite. The `@sksizer/markdown-render` renderer is checked against
the same file's `obsidian` answers.
