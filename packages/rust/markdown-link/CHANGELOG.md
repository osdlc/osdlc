# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.9.0](https://github.com/osdlc/osdlc/compare/markdown-link/v0.8.1...markdown-link/v0.9.0) - 2026-11-08

### Fixed

- `CodeRules::CommonMark` finds a fenced code block inside a list item or a
  block quote, so the links after it are found. A fence opens when it is
  indented to its item's content column, and an unclosed fence runs to the end
  of its container, not of the input. `CodeRules::SkillExport` is unchanged.
  Lazy continuation lines are not tracked.
- `CodeRules::CommonMark` keeps a code span inside its cell of a table row (a
  line starting with `|`): a `|` not escaped as `\|` ends the cell, so
  ``| `a | [[x]] | b` |`` finds `[[x]]`.
- `\![[Note]]`, an escaped `!`, is a `BodyLinkKind::Wikilink` whose span
  starts at the `[[`, where it was an `Embed` starting at the `!`; an
  abandoned `[[` after one has `embed: false`.

### Added

- `CodeRules::None` finds no code: `strip_code_with` returns its input
  unchanged, and a `ScanOptions` with it scans text whose code a markdown
  parser has already taken out.
- `Fences::content_start`, where the text of the last line starts past its
  block quote and list item markers.
- `packages/conformance/markdown-link/suite.json` is the shared suite, with
  cases for each of the above, and `cargo run -p markdown-link --example
  conformance-write` writes its expected values. It replaces
  `tests/fixtures/conformance.json`.

### Changed

- **Breaking:** `CodeRules` gains the variant `None`, so an exhaustive `match`
  on it needs an arm, and `Fences` holds the open containers, so it is no
  longer `Copy`.

## [0.8.1](https://github.com/osdlc/osdlc/compare/markdown-link/v0.8.0...markdown-link/v0.8.1) - 2026-11-08

### Fixed

- *(markdown-link)* escaped backticks are literal; same-note links display ([#694](https://github.com/osdlc/osdlc/pull/694))

### Fixed

- `strip_code`: under `CodeRules::CommonMark` a backtick after an odd run of
  `\` is a literal backtick and opens no code span, so a link in
  ``See \`[[Note]]\` here`` is found. `CodeRules::SkillExport` does not honour
  the escape, as before.
- `display_text` shows a link into the same note, `[[#Setup|steps]]` or
  `[[#Setup]]`, as its alias, or else its heading or `^block`, where it
  dropped the link.
- `tests/fixtures/conformance.json` carries both as `code` and `display`
  cases, which `@osdlc/markdown-link` reads too.

## [0.8.0] - 2026-11-04

The scanner reports each `[[` it gave up on. Nothing is removed or changed.
`@osdlc/markdown-link` gets the same in its 0.8.0, and both suites read the
new cases.

### Added

- `scan_body_with(body, &ScanOptions) -> BodyScan`: the links
  `body_links_spanned_with` returns, and `abandoned`, each `[[` found outside
  code that is not a link, as an `AbandonedLink` (`reason`, `embed`,
  `byte_start`, `byte_end`). `AbandonReason` is `Bracket` (a `[` or `]`
  before `]]`), `Code` (the target is only code), `EmptyTarget` (`[[]]`,
  `[[ |alias]]`, or `[[#Heading]]` without `self_links`) or `Unclosed`.
  A `[[` that a link found after it starts inside is not reported:
  `[[[Note]]` is a literal `[` and a link. A run of `[` with no link after
  it, such as `[[[TODO`, is one entry: from the first `[[`, with the reason
  and end of the last.
  `body_links_spanned_with` is unchanged and returns `scan_body_with`'s links.
- `tests/fixtures/conformance.json`: a body case may list `abandoned`; one
  that leaves it out expects none.

### Fixed

- `percent_decode` takes an escape only when both characters after `%` are
  hex digits. `u8::from_str_radix` also takes a sign, so `%+5` decoded; it now
  stays as written. The conformance case `plus_sign_reads_as_a_hex_byte` is
  now `a_sign_is_not_a_hex_digit`, and `@osdlc/markdown-link`'s
  `percentDecode` matches.

## [0.7.0] - 2026-11-04

Options for tools that render or publish notes, a strict resolver, and helpers
that write a resolved link back out. The defaults keep the old behaviour,
except for block references, which now have a field of their own. There is no
0.6: this release joins `@osdlc/markdown-link` on 0.7.

### Added

- `ScanOptions` and `body_links_spanned_with(body, &ScanOptions)`: pick the
  code rules (`CodeRules::SkillExport`), skip links inside HTML comments
  (`skip_html_comments`), and read `[[#Heading]]` and `[[#^block]]` as a link
  to the note they are in, with an empty target (`self_links`).
  `ScanOptions::default()` is what `body_links_spanned` does.
- `parse_inner_self`: `parse_inner` that also reads a body with no target and
  a `#` fragment as a link to the note it is written in.
- `WikiLink::block` and `BodyLink::block`: a `#^id` fragment, without the `^`.
- `WikiLink::size` and `BodyLink::size`: an embed's `|300` or `|300x200`, as
  `Size { width, height }`. `Size::parse` and `is_size_spec` read one. The
  alias still holds it as written.
- `BodyLink::heading`.
- `LinkIndex::candidates(target, from)`: every path a link could mean,
  shortest first, the field `resolve_from` chooses from.
- `LinkIndex::resolve_strict(target, from)`: resolve without guessing. It
  takes a candidate only when it is the only one, its whole path is the
  target, or it sits at the target's path from the linking note's folder.
  Otherwise `ResolveError::Ambiguous` lists every candidate.
- `relative_link(from, to, fragment)`: the relative markdown link from one
  vault-relative file to another, each segment encoded as `encodeURIComponent`
  does and the fragment as `encodeURI` does with `#` escaped.
  `encode_uri_component`, `encode_uri_fragment` and `escape_label` are public
  too.

### Changed

- A `#^id` fragment is a block, not a heading. `parse_inner("Note#^abc", _)`
  gives `heading: None, block: Some("abc")`, where it gave
  `heading: Some("^abc")`. A heading path such as `Note#Parent#Child` is
  unchanged.
- `WikiLink` and `BodyLink` have new public fields, so code that builds one
  with a struct literal must set them.

## [0.5.5](https://github.com/osdlc/osdlc/compare/markdown-link/v0.5.4...markdown-link/v0.5.5) - 2026-11-01

### Other

- updated the following local packages: frontmatter-lossless

## [0.5.4](https://github.com/osdlc/osdlc/compare/markdown-link/v0.5.3...markdown-link/v0.5.4) - 2026-10-31

### Other

- add @osdlc/markdown-link, the TypeScript twin ([#567](https://github.com/osdlc/osdlc/pull/567))

## [0.5.3](https://github.com/osdlc/osdlc/compare/markdown-link/v0.5.2...markdown-link/v0.5.3) - 2026-10-30

### Changed

- Depend on slug-collate 0.2. slug-collate 0.1.2 was yanked, and this
  crate's earlier releases require it. Only `compare_paths` is used, and its
  order is unchanged, so behaviour is the same.

## [0.5.2](https://github.com/osdlc/osdlc/compare/markdown-link/v0.5.1...markdown-link/v0.5.2) - 2026-10-29

### Fixed

- *(markdown-link)* match whole folder names when preferring a folder ([#543](https://github.com/osdlc/osdlc/pull/543))

### Fixed

- `prefer_in_folder` (and so `LinkIndex::resolve_from`) matches whole folder names. A note in
  `notes/` no longer prefers a candidate in `notes2/`.

## [0.5.1](https://github.com/osdlc/osdlc/compare/markdown-link/v0.5.0...markdown-link/v0.5.1) - 2026-10-28

### Other

- updated the following local packages: yaml-splice

## [0.5.0] - Unreleased

First public release. `markdown-link` parses wiki-style and Markdown links — every `[[wikilink]]`,
`![[embed]]`, relative markdown link and frontmatter link in a note, with code spans excluded — and
resolves a target against a set of file paths by path suffix.

### Added

- `LinkIndex`: build a suffix index from vault paths, then `resolve`/`resolve_from` a target to a
  vault path (any path suffix reaches a file; a tie prefers the linking note's own folder, then the
  shorter full path, measured in characters).
- `body_links` and `body_links_spanned`: every wikilink, embed and relative markdown link in a note
  body, in order, the spanned form carrying byte offsets.
- `frontmatter_links` and `frontmatter_paths`: wikilinks and file-path values hiding in frontmatter,
  each tagged with its key; `may_hold_frontmatter_paths` is a cheap pre-test that skips the YAML
  parse.
- `parse_inner`, `target_range`, `parse_typed_ref`/`TypedRef`: parse one wikilink body, locate its
  target for in-place rewriting, or read a whole `[[type/slug|alias]]` value for shape.
- `display_text`: replace each link with what a reader sees (its alias, or its target), dropping an
  embed's `|300`/`|300x200` size suffix.
- `is_vault_link_url`, `md_link_target`, `strip_md_ext`, `percent_decode`, `normalize_target`,
  `suffixes`, `prefer_in_folder`, `join_relative`, `ATTACHMENT_EXTENSIONS`: the shared normalisation
  a second parser reuses so two scanners agree on what a target is.
- `code` module: `strip_code`/`strip_code_with` blank fenced and inline code to spaces (character
  count preserved) under `CodeRules::CommonMark` or `CodeRules::SkillExport`, with `Fences`, `Spans`
  and `FenceLine` for a streaming scan.

### Changed

Since 0.4.2, the last version in the history below:

- **Breaking:** `strip_to_display_text` is now `display_text`. An embed's trailing `|300` or
  `|300x200` is a size, not display text, so `![[img.png|300]]` shows `img.png`. An empty alias
  shows the target.
- **Breaking:** a body link carries an `alias`, the text after the first `|` outside code. Code
  that builds a `BodyLink` by struct literal must set it.

## History before the first public release

These versions were never published. They are rebuilt from the git history, one version per change.
A breaking entry breaks code written against the version before it.

- 0.4.2 (2026-10-15): added `frontmatter_paths`, for frontmatter values that name a file by path,
  and `may_hold_frontmatter_paths`, a cheap pre-test that skips the YAML parse.
- 0.4.1 (2026-10-11): trimming and markdown URL scanning run in linear time.
- 0.4.0 (2026-10-11): **Breaking:** `strip_code` follows CommonMark code rules by default, so tilde
  fences, fences longer than three and double-backtick spans are now code, and their links are no
  longer found. `body_links` returns links in the order they appear, not wikilinks first. The `code`
  module is public (`CodeRules`, `FenceLine`, `Fences`, `Spans`, `strip_code_with`). A code span no
  longer runs past its heading or table-row line.
- 0.3.6 (2026-10-06): added `target_range`. A backslash before the alias pipe is treated as an
  escape.
- 0.3.5 (2026-10-05): internal dependency changes; no API change.
- 0.3.4 (2026-10-05): code blanking moves into this crate; `strip_code` keeps its path.
- 0.3.3 (2026-09-29): added `join_relative`. `resolve_from` follows `./` and `../` targets from the
  linking note's folder.
- 0.3.2 (2026-09-18): added `body_links_spanned`, `BodyLink` and `BodyLinkKind`, a scan that
  reports each link's byte offsets.
- 0.3.1 (2026-09-11): added `wikilink_targets`.
- 0.3.0 (2026-08-22): **Breaking:** the shortest-path tie-break counts characters, not path
  segments, so some targets resolve to a different file. Added `resolve_from` and
  `prefer_in_folder`: a contested name prefers the linking note's own folder.
- 0.2.1 (2026-08-22): `tiff` and `heic` count as attachments.
- 0.2.0 (2026-08-22): **Breaking:** `is_md_link_url` is now `is_vault_link_url`, and is true for
  attachment links too. Added `ATTACHMENT_EXTENSIONS`. Markdown links to attachments are found as
  links.
- 0.1.4 (2026-08-22): `strip_code` shares one implementation; no API change.
- 0.1.3 (2026-08-22): added `suffixes`.
- 0.1.2 (2026-08-22): added `is_md_link_url`, `md_link_target`, `strip_md_ext` and
  `percent_decode`.
- 0.1.1 (2026-08-15): `LinkIndex::build` no longer slices bytes off a path.
- 0.1.0 (2026-08-07): first usable API: link parsing, body and frontmatter scans, display text, and
  `LinkIndex` with path-suffix resolution, tested with a fixture vault.
