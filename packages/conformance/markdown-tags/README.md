# markdown-tags

Inline `#tag` lexing for Markdown note bodies, in three dialects: `obsidian`
(the default; Obsidian's rule, with code, link destinations and reference
definitions blanked first), `unicode` (every Unicode letter and number, and
code is scanned) and `ascii` (ASCII names, code blanked, a tag may follow
`(`). Each dialect's rule is stated in the Rust crate's docs.

| Implementation | Language | Directory |
|---|---|---|
| `markdown-tags` (reference) | Rust | `packages/rust/markdown-tags` |
| `@osdlc/markdown-tags` | TypeScript | `packages/ts/markdown-tags` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Tags come back without the `#`, in the order they appear and
not deduplicated. Write a new case's `input` by hand, then run

```sh
cd packages/rust
cargo run -p markdown-tags --example conformance-write
```

to write its `expect`. Never write that by hand.

## Sections

- `inline_tags`: the tags found in a body under all three dialects. Both
  implementations run every case, and check that `extract_both` /
  `extractBoth` agrees with the `unicode` and `ascii` answers.
- `tag_at`: the tag at an offset under one dialect, by the character rule
  alone, with no code or link blanking. Offsets are UTF-8 bytes; the
  TypeScript runner converts to its UTF-16 index, and an offset off a
  character boundary or past the end gives null.
- `renderer_only`: the tags a renderer shows where it reads the syntax tree
  and a source scan cannot match it: markup right before a `#`
  (`**bold**#tag`), a decoded entity (`a&nbsp;#tag`), and link text. Neither
  library runs this section; a renderer does (`@osdlc/markdown-render` reads
  it). Its `expect` values are the renderer's, so the generator keeps them as
  written.

## Notes on cases

Why a case is there, where its name does not say it:

- `adjacent_tags`: One space between tags: a regex that consumes the space before a # loses every second tag.
- `digits_then_slash`: A slash is not a number, so it meets Obsidian's rule alone.
- `combining_marks`: The vowel signs are marks, not letters, but they are Alphabetic, so the tag is whole.
- `superscript_and_fraction`: ² and ½ are numbers (No), so they do not meet Obsidian's rule.
- `roman_numeral`: Ⅻ is a number (Nl) and also Alphabetic, so it meets Obsidian's rule.
- `next_line_before_hash`: U+0085 is White_Space but not JavaScript's \s.
- `byte_order_mark_before_hash`: U+FEFF is JavaScript's \s but not White_Space.
- `code_span_touching_the_hash`: No whitespace before the #, so no dialect needs the code blanked to skip it.
- `hash_after_a_code_span`: Blanking turns the span into spaces, so the # follows whitespace. The renderer agrees: the # starts a text node.
- `bold_then_hash`: The renderer scans each text node, and #tag starts one. A source scan sees the * before the #.
- `link_text`: The renderer never tags link text: the tag's <a> would sit inside the link's <a>. A source scan finds tag.
- `link_text_in_emphasis`: The renderer skips the whole link subtree, not only its direct text.
- `strikethrough_then_hash`: Like bold_then_hash: #tag starts a text node in the renderer. Every source scan finds nothing, because ~ comes before the #.
- `entity_space_before_hash`: The renderer decodes &nbsp; to U+00A0, which is whitespace. Every source scan finds nothing, because ; comes before the #.
- `link_destination`: A link destination is not text. obsidian blanks it, as the renderer reads it. The ( opens a tag for ascii, which finds section.
- `image_destination`: As link_destination.
- `reference_definition`: A reference definition is not text. obsidian blanks it, as the renderer reads it. The # follows a space, so unicode and ascii find def.
- `destination_with_title`: A link title is not text either, so obsidian blanks it with the destination.
- `destination_with_nested_parens`: A destination may hold balanced parentheses.
- `unclosed_destination`: No ) closes it, so it is not a link and the renderer reads it as text.
- `destination_inside_an_unclosed_destination`: The outer ( never closes, so only the inner link has a destination.
- `bracket_without_link_text`: No [ opens link text, so ](...) is not a destination.
- `escaped_bracket`: An escaped [ opens no link text.
- `destination_across_a_blank_line`: A blank line ends the paragraph, so the ( is never closed.
- `footnote_definition`: A footnote's text is rendered, so obsidian does not blank it.
- `definition_after_a_heading`: A heading is not a paragraph, so a definition may follow it directly.
- `definition_after_an_indented_heading`: A heading may be indented up to three spaces.
- `hash_line_is_not_a_heading`: No space follows the #, so the line is a paragraph and the definition cannot interrupt it.
- `definition_after_a_blank_line_crlf`: As a definition after a blank line, with CRLF line endings.
- `destination_across_a_blank_line_crlf`: As destination_across_a_blank_line, with CRLF line endings.
- `definition_inside_a_paragraph`: A reference definition cannot interrupt a paragraph, so this line is text.
