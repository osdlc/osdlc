# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `MarkdownRenderOptions.tagDialect`, and `RemarkTagsOptions` on `remarkTags`: which
  `@sksizer/markdown-tags` rule tags `#tag` text. Default `obsidian`, the rule the renderer had.
  `MarkdownRender` rebuilds its processor when `tagDialect` changes.
- `isDelimitedPath` for CSV and TSV files; `.tsv` now counts as textual.
- `sliceEmbed`, `MAX_EMBED_DEPTH` and `MAX_EMBEDS_PER_DOCUMENT` from the `./plugins` entry, so a
  host that renders embeds without Vue applies the app's slicing and limits. The two limits moved
  from `vue/context.ts` to `plugins/embeds.ts`; `./vue` still exports them.
- Shared embed rendering rules in `./plugins`: `embedSize`, `embedAlt`, `embedBlocker` (the guard
  order), `embedPlaceholder`, `embedMedia` and `embedNoteProperties`. They return hast, and both
  `Embed` and `@sksizer/markdown-astro` render with them. A display whose last `|` part is
  a size (`![[a.png|Caption|300]]`) is now sized, with `Caption` as alt text, and a PDF link keeps a
  `#page=N` fragment. A markdown image's alt follows the same rule: `![Cap|300](picture.png)`
  renders with `alt="Cap"` and `width="300"`.

### Changed

- Renamed the Obsidian-prefixed exports: `ObsidianCallout` is now `Callout`, `ObsidianEmbed` is
  now `Embed` and `ObsidianHandlers` is now `RenderHandlers`. The embed mdast node type is
  `wikiEmbed` (was `obsidianEmbed`).
- `sliceByHeading`, `sliceByBlockId`, `sliceEmbed` and `sourceHeadings` no longer skip a leading
  `---` block as frontmatter. They expect a body, so a body that starts with `---` keeps it as a
  thematic break.
- Renamed the remaining Obsidian names (breaking): `ObsidianMarkdown` is `MarkdownRender`,
  `createObsidianProcessor` is `createMarkdownProcessor`, `ObsidianRenderOptions` is
  `MarkdownRenderOptions` and `obsidianSchema` is `markdownSchema`. The theme contract follows:
  `--obsmd-*` variables are `--markdown-*`, `obsmd-*` classes are `markdown-*`, `data-obsmd-nonce`
  is `data-markdown-nonce` and the `.obsidian-md` root class is `.markdown-render`. Rendering is
  otherwise unchanged; hosts that override the old variables or classes must rename them. The
  `markdown-` prefix is shared with Obsidian's own `.markdown-embed*` classes, so a host that loads
  Obsidian theme CSS beside the renderer will style its embeds.
- Renamed from `@sksizer/obsidian-md` to `@sksizer/markdown-render`, and the directory from
  `packages/ts/obsidian-md` to `packages/ts/markdown-render`. The `<obsidian-embed>` element the
  pipeline emits is now `<markdown-embed>`, and so is its component route key. Rendering is
  otherwise unchanged.
- `embedKind` classifies a target with a media extension by its extension, even with a fragment:
  `![[doc.pdf#page=3]]` is a PDF, not a heading embed.
- `remarkTags` reads tags with `tagAt` from `@sksizer/markdown-tags` instead of its own regex.
- `ATTACHMENT_EXTENSIONS` now comes from `@sksizer/wikilink` and is re-exported unchanged. Its type
  is `readonly string[]`.
- Footnote ids are `markdownRender_fn-N` and `markdownRender_fnref-N` (remark-rehype's
  `clobberPrefix`), not `user-content-fn-N`. A note's raw ids are still moved into
  `user-content-`, so a raw `id="fn-1"` can no longer take over a footnote's anchor. A host that
  links to `#user-content-fn-N` must use the new ids.

### Fixed

- Block ids: `^id` on its own line at the end of a paragraph is lifted, as `sliceByBlockId`
  reads it; a trailing `^id` on a nested list item stays on that item; a one-line callout title's
  `^id` anchors the callout; a standalone `^id` after raw HTML, a definition or a footnote stays
  literal.
- Callouts: a title line ending in a hard break no longer pulls the body into the title, and a lone
  embed (or markdown image) on the first body line is block-level, like anywhere else.
- `%%comments%%` no longer delete `&nbsp;` spacer paragraphs.
- Heading slugs no longer take `footnote-label` or a footnote's `user-content-fn-*` id.
- Reference-style links and images (`[x][ref]`, `![x][ref]`) to notes and attachments are claimed
  like the inline forms, and `[[Note]]` stays a wikilink when a `[Note]: url` definition exists.
- A raw-HTML `id` (or id reference) whose `user-content-` form is already a pipeline id is
  dropped, so `<span id="fn-1">` no longer takes over the footnote anchor.
- A `constructor` fence no longer breaks Shiki for every later grammar.
- `x ==== y` stays literal instead of an empty `<mark>`.
- `[[]]`, `[[ ]]`, `[[|]]` and `![[]]` stay literal; `[[Folder/]]` has a visible label.
- `loadKatex` no longer caches a failed import; the next render imports again, as the mermaid
  loader does.
- A failed mermaid render no longer leaves mermaid's "Syntax error" graphic in `document.body`
  (`suppressErrorRendering: true`). Render ids are now `markdownRender_mermaid-N`, which no heading
  slug or block id can spell, so drawing a diagram no longer removes a heading with that id.
- `extractOutline` leaves out GFM's screen-reader-only "Footnotes" label and the footnote
  reference number in a heading's text.
- The slicers (`sliceByHeading`, `sliceByBlockId`, `sourceHeadings`): CRLF sources slice; a
  heading wholly inside a `%%` comment is neither a target nor a section boundary, while one whose
  line closes the comment still is (a `%%` in indented code or raw HTML opens no comment, and
  indented code counts directly under a heading or a rule); a `#` line in raw HTML or indented code
  is not a heading, and an ATX heading may be indented up to three spaces; a `---` under a list
  item, a quote line or another rule is not a setext heading; heading matching ignores punctuation
  as Obsidian's does, after an exact match; `Heading#Subheading` paths resolve before the whole
  fragment is read as one heading, and a lone trailing `#` (`C#`) is not a path; a body that opens
  with a `---` rule keeps its headings and block ids; a line that opens with an inline tag
  (`<b>Note</b> text`) is a paragraph, not a raw HTML block; a block-id slice stops at a heading; a
  `^id` line under a paragraph, list item or quote slices that block, as the renderer lifts it; and
  a `^id` the renderer leaves as text (mid-paragraph, a marker line with text under it, or a marker
  with no block above it, a marker-line run under a heading, rule or fence, a marker on or under a
  table row, or one under a block-level HTML tag that interrupts a paragraph) resolves to nothing,
  without hiding a later valid marker with the same id; a `^id` line under indented code slices
  the code; and a block-level HTML tag under paragraph text opens a raw HTML block.

### Removed

- The `INLINE_TAG_RE` export. Nothing imported it; `@sksizer/markdown-tags` owns the rule.

## [0.5.0] - 2026-10-08

### Changed

- Part of the markdown ecosystem omnibus and its Phase 3 decisions; tag handling updated
  ([#2788](https://github.com/sksizer/dev/pull/2788),
  [#2891](https://github.com/sksizer/dev/pull/2891)).

## [0.4.2] - 2026-10-06

### Fixed

- A trailing `#` that is part of heading text is kept
  ([#2752](https://github.com/sksizer/dev/pull/2752)).
- A block id now requires preceding whitespace ([#2792](https://github.com/sksizer/dev/pull/2792)).

## [0.4.1] - 2026-09-10

### Fixed

- Defects from whole-codebase bug sweeps, including a stale embed-ancestor chain and SVG attribute
  case in the Vue renderer ([#1714](https://github.com/sksizer/dev/pull/1714),
  [#1737](https://github.com/sksizer/dev/pull/1737),
  [#1759](https://github.com/sksizer/dev/pull/1759)).

### Changed

- `exactOptionalPropertyTypes` enabled; tabs and related-files views consume entity icons
  ([#1777](https://github.com/sksizer/dev/pull/1777),
  [#2009](https://github.com/sksizer/dev/pull/2009),
  [#1974](https://github.com/sksizer/dev/pull/1974)).

## [0.4.0] - 2026-09-03

### Added

- `./plugins` export of the individual remark/rehype plugins, and an async seam for JSON canvas
  ([#1717](https://github.com/sksizer/dev/pull/1717)).
- Wider adoption across the shared markdown layer (ontological, determined, agent chat)
  ([#1721](https://github.com/sksizer/dev/pull/1721),
  [#1724](https://github.com/sksizer/dev/pull/1724)).

### Changed

- Large sources open under the performance budget; Shiki is opt-in
  ([#1722](https://github.com/sksizer/dev/pull/1722)).

### Fixed

- First fence off a cold grammar tokenizes from the right scope
  ([#1720](https://github.com/sksizer/dev/pull/1720)).

## [0.3.0] - 2026-08-27

### Added

- Code fence chrome (language, copy, wrap), syntax highlighting in fences, table extras (column
  sort, pinned header, copy as CSV), folding of heading sections and list items, and one in-note
  find ([#1345](https://github.com/sksizer/dev/pull/1345),
  [#1355](https://github.com/sksizer/dev/pull/1355),
  [#1349](https://github.com/sksizer/dev/pull/1349),
  [#1403](https://github.com/sksizer/dev/pull/1403),
  [#1412](https://github.com/sksizer/dev/pull/1412)).

### Fixed

- Types are runtime dependencies, not dev ([#1377](https://github.com/sksizer/dev/pull/1377)); bug
  sweep ([#1458](https://github.com/sksizer/dev/pull/1458)).

## [0.2.0] - 2026-08-22

### Added

- Reading experience for notes: tree, tabs, rendered notes, backlinks, quick switcher; bases,
  canvas, daily notes and templates ([#1143](https://github.com/sksizer/dev/pull/1143),
  [#1150](https://github.com/sksizer/dev/pull/1150)).
- Markdown images route through the embed element, and one authority decides what a vault attachment
  is ([#1307](https://github.com/sksizer/dev/pull/1307),
  [#1315](https://github.com/sksizer/dev/pull/1315)).

### Changed

- Event-driven freshness, delta application and stable page identity
  ([#1293](https://github.com/sksizer/dev/pull/1293)); security, accessibility and scale hardening
  ([#1166](https://github.com/sksizer/dev/pull/1166)).

## [0.1.0] - 2026-08-16

### Added

- Initial release: Obsidian-dialect markdown renderer on unified/remark (wikilinks, embeds,
  callouts, tags, highlights, comments) with a Vue 3 integration, a `buildNode` seam, and
  `rawTarget` / `rawAlias` on the payload.

### Fixed

- Wikilink and embed tokenizers hardened against ReDoS.
