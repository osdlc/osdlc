# @osdlc/markdown-render

Markdown to HTML on unified and remark, for CommonMark,
GFM and the Obsidian extensions: wikilinks, embeds, callouts, tags, block ids,
comments and highlights. Link resolution is injected, so the same renderer
serves a live vault, a static build and tests, and the output is sanitized.
Every feature is a remark or rehype plugin over the standard mdast/hast
pipeline. There is no bespoke parser in this package, and there must not be
one.

## Install

```sh
npm install @osdlc/markdown-render
```

`katex` (math) and `mermaid` (diagrams) are optional peer dependencies.
Install the ones you use. Node 22 or later; the package is framework-free pure
JavaScript with no
filesystem, process or OS-specific code.

## Who it is for

Programs that turn a markdown note into HTML or a hast tree and must treat
`[[wikilinks]]`, `![[embeds]]`, callouts and `#tags` the way Obsidian does:
note-reading views, static site and Astro builds, and previews beside an editor.

## When not to use it

- You render plain CommonMark or GFM. `remark-rehype` with the GFM plugin is
  smaller, and this package's install weight (Shiki, rehype-raw, the sanitizer)
  buys you nothing.
- You only want `[[wikilinks]]` turned into links in an existing remark
  pipeline. A wikilink plugin alone fits better, or use this package's
  `/plugins` entry, which carries the dialect plugins with no Shiki in the graph.
- You need Obsidian's editor, Canvas or Bases views. This renders notes only.

## How it compares

- `remark-wiki-link`, `@moritzrs/micromark-extension-ofm-wikilink` and similar:
  one syntax each. This package covers wikilinks, embeds, callouts, tags, block
  ids, comments and highlights together, with one sanitizing pipeline, and finds
  links with [`@osdlc/markdown-link`](../markdown-link)'s scanner, so a tool
  that reads the same notes agrees with the renderer on every link.
- `markdown-it` with Obsidian plugins: a different parser and plugin model; this
  package is unified-native, so remark and rehype plugins compose with it.
- Obsidian's own renderer: not embeddable outside the app.

## Stability

The package is 0.x: a minor release may break the API. The stable API is every
export not listed under *Experimental exports* below. 

### Experimental exports

These have no known consumer outside the package. They are documented host
contracts for a self-assembled pipeline, and they may change in a minor release.
Each carries an `@experimental` TSDoc tag, and a test keeps this list and the
tags in step.

- Root and `/plugins`: `setHProps`, `hastNode`, `MdParent`, `wikilinkNode`,
  `splitMarkdownLink`, `splitMarkdownImage`, `remarkDataLine`, `hastText`,
  `CLASS_ROUTES`, `STRIPPED_CLASSES`, `FENCE_LANG_PROP`, `carriesRoutingSignal`,
  `isRoutingClass`, `stripRoutingSignals`, `ClassRoute`.

For Vue 3 components over this renderer, see [`@osdlc/markdown-render-vue`](../markdown-render-vue).

## Dialect

| Feature | Syntax | Renders as |
| --- | --- | --- |
| Wikilink | `[[Note]]`, `[[Note\|alias]]`, `[[Note#Heading]]`, `[[Note#^block]]`, `[[#Heading]]` | `<a class="wikilink" data-wikilink data-kind [data-path] [data-heading] [data-block-id]>` |
| Markdown note link | `[label](Note.md)`, `[label](a/b.md#Heading)` | the same `<a class="wikilink">` — relative `.md` targets only |
| Missing link | any unresolvable target | `<a class="wikilink wikilink-missing">` — no `href` |
| Embed | `![[Note]]`, `![[img.png\|300]]`, `![[clip.mp4]]`, `![[Note#Heading]]`, `![[Note#^block]]` | `<markdown-embed data-embed-target data-embed-kind="note\|image\|video\|audio\|pdf\|heading\|block">` |
| Callout | `> [!type]` `+` optional `-`/`+` fold and title | `<div class="callout" data-callout [data-fold]>` wrapping `.callout-title` + `.callout-content` |
| Tag | `#project/alpha` | `<a class="tag" data-tag="project/alpha">` |
| Highlight | `==text==` | `<mark>` |
| Comment | `%%hidden%%`, block `%%…%%`, unclosed `%%` | removed — `%%` is document-level, so a comment runs to the next `%%` across any number of blocks, and an unclosed one to the end of the note |
| Escaped syntax | `\[\[x]]`, `\#tag`, `\==m==`, `\^id`, `\%%…%%` | literal text; no dialect feature activates |
| Block id | line-terminal `^abc123` | `id` + `data-block-id` on the block, marker text removed |
| Task | `- [ ]` / `- [x]` | GFM's checkbox, plus `data-line` on the `<li>` |
| Math | `$a^2$`, `$$…$$` (opt-in) | `<code class="language-math math-inline">` / a `math` fence |
| Everything else | CommonMark + GFM | as remark renders it |

Every block-level element also carries `data-line`, the 1-based source line, for
editor/preview source mapping. Heading ids are github-slugger slugs computed
over the *rendered* text — except where a `^block-id` claims the same spelling.
An author's block id is a link target and cannot move, so it is reserved first
wherever in the note it sits, and a heading that would slug to it takes the
numbered suffix instead: `# Foo` in a note that also holds `para ^foo` renders
as `id="foo-1"`, whichever of the two comes first. A heading anchor is
therefore *not* a pure function of the heading text. Resolve `[[Note#Heading]]`
against `extractOutline`, which reads the id off the rendered tree; re-slugging
the heading text or the link's `data-heading` value can land on the block
instead.

## Core usage

```ts
import { renderToHtml, renderToHast, extractOutline } from '@osdlc/markdown-render'
import { rehypeShiki } from '@osdlc/markdown-render/shiki'

const html = await renderToHtml(body, {
  resolveLink: (target) => vault.has(target)
    ? { kind: 'note', path: `/notes/${target}`, display: target }
    : { kind: 'missing', display: target },
  notePath: 'Journal/2026-08-02.md',
  highlight: rehypeShiki(),
  math: true,
})

const tree = await renderToHast(body, { /* … */ })
const outline = extractOutline(tree) // [{depth, text, id}, …]
```

`source` is a note **body**: frontmatter is document framing and is the caller's
to split off (the renderer never reads it).

### Subpath exports

| Entry | Carries |
| --- | --- |
| `@osdlc/markdown-render` | the processor (`renderToHtml`, `renderToHast`, …), the math and mermaid helpers, outline/slice/path utilities, the sanitize schema, and every dialect plugin |
| `@osdlc/markdown-render/plugins` | the dialect plugins alone, plus what a host needs to render embeds itself (`sliceEmbed`, `MAX_EMBED_DEPTH`, `MAX_EMBEDS_PER_DOCUMENT`, and the shared embed rendering rules `embedSize`, `embedAlt`, `embedBlocker`, `embedPlaceholder`, `embedMedia`, `embedNoteProperties`) and the `LinkResolution`/`WikilinkResolver` types — for a host that assembles its own remark pipeline (an Astro build, a static exporter) |
| `@osdlc/markdown-render/shiki` | the Shiki code highlighter, loaded on demand |
| `@osdlc/markdown-render/theme.css` | the `--markdown-*` theme contract |

`./plugins` is Shiki-free: it omits `rehypeShiki` (and
`RESERVED_FENCE_LANGS`, which configures it), so a bundle that imports it
never carries a Shiki chunk. `rehypeCodeMeta` is included; it does not
import Shiki. The root entry keeps re-exporting the same plugins; the two
export lists are maintained by hand and must stay in step.

Resolution is always injected — the renderer never touches a filesystem, an
index, or a router. `resolution.path` becomes the anchor's `href` for every kind
but `missing`.

### Sync rendering and framework-free helpers

`renderToHtmlSync(markdown, options)` is `renderToHtml`'s synchronous twin.
It throws when `options.highlight` is set — a highlight pass may be async;
every other plugin in the pipeline is sync.

`renderMath(latex, displayMode)` / `loadKatex()` and
`renderMermaid(source, theme?)` / `createMermaidRenderer(load)` are the
framework-free math and diagram seams. KaTeX and mermaid are imported lazily on
first use; mermaid is initialized once per theme with ids from one sequence;
`createMermaidRenderer` wraps a caller-supplied loader so tests and hosts can
inject their own module. `@osdlc/markdown-render-vue`'s `MathBlock`/`MermaidBlock` are thin wrappers
over these helpers, so any other host (e.g. an editor widget) shares the same
rendering.

**Optional peers.** `katex` and `mermaid` are optional peer dependencies. A
host that renders math or diagrams declares them itself in its own `package.json`. When one is absent its dynamic import rejects, the
package logs one warning per process
(`@osdlc/markdown-render: katex is not installed; math renders as source`), and
the Vue blocks (in `@osdlc/markdown-render-vue`) show the source instead of nothing: `<code
class="markdown-math-fallback">` for math, `<pre class="markdown-mermaid-fallback">`
for a diagram.

`LoadedNote` — a note body plus its raw frontmatter YAML — is a core type.

### Pipeline

`remark-parse` → `remark-gfm` → (`remark-math`) → *escape mask* → comments →
wikilinks → embeds → markdown note links → callouts → tags → highlight → block
ids → *escape restore* → heading ids → `data-line` → `remark-rehype` (raw HTML
allowed) → fence metadata → *mark* → `rehype-raw` → *enforce* →
`rehype-sanitize` → (the consumer's `highlight` pass).

Wikilinks and embeds are found by `@osdlc/markdown-link`'s body scanner, which
reads the source once, and placed in the tree by source offset. The scan is
linear, so there is no cap on a field's length and no node is skipped for being
large. When you drive `createMarkdownProcessor` by hand, pass the source to
`run` (`processor.run(tree, { value: source })`) so offsets are available;
without it only links inside a single text node are found, and an alias that
carries markup (`[[Note|the *key* idea]]`) stays text.

Comments run ahead of every tokenizer, so commented-out content never becomes
nodes: a `[[link]]` inside a comment does not reach the host's `resolveLink`,
and an `![[embed]]` inside one does not load a note.

`comments: false` takes the pass out. `%%…%%` is a vault authoring convention,
so it is on by default — but a host rendering text that is not a vault note (an
agent answer, a chat message) should turn it off: there a doubled percent is
far more likely to be printf, LaTeX, or a SQL or Python format string than a
marker, and honouring it deletes the author's own words. An unmatched `%%`
takes the rest of the document with it, and the loss is silent.

*escape mask* and *escape restore* are the pair in `plugins/escapes.ts`. remark
resolves `\[` to `[` while parsing, so without them a dialect tokenizer cannot
tell `\[\[Note]]` from `[[Note]]`. The mask is a `mdast-util-from-markdown`
extension that wraps each escaped character the dialect keys on in a private-use
sentinel, so it is no longer adjacent to its neighbours and no tokenizer opens
on it; the restore deletes the sentinels once the last tokenizer has run, so
nothing downstream ever sees one.

*mark* and *enforce* are the provenance pair (`plugins/provenance.ts`): the gap
between them is the only window in which the pipeline's own markup and a note's
raw HTML are still distinguishable, and that distinction is what keeps a
hand-written `<markdown-embed>` or `<input>` from driving a component, keeps a
note's `id` out of the pipeline's own namespace, and strips the routing signals
off note-authored markup.

Each plugin is exported individually (`remarkWikilinks`, `remarkCallouts`, …)
from the root and from `@osdlc/markdown-render/plugins` for hosts that want to
assemble their own pipeline.

### Sanitization

`markdownSchema` extends `rehype-sanitize`'s GitHub-derived default minimally:
dialect `data-*` attributes, `<mark>`, `<markdown-embed>`, task-list
checkboxes, and `id` on flow elements. Raw HTML in a note is parsed by
`rehype-raw` and *then* sanitized, which is the only safe order. `<script>`,
event handlers, `javascript:` URLs, and `data:` iframes are stripped — see
`tests/sanitize.test.ts`, which asserts each of those adversarially.

Four things it does that the default schema does not:

- **`className` is an allowlist, not an opening.** Only the classes the
  pipeline emits and the namespaces they live in survive — `callout*`,
  `wikilink*`, `tag`, `contains-task-list`, `task-list-item*`, `footnotes`,
  `sr-only`, `data-footnote-backref`, `math-inline`/`math-display`,
  `language-*`, `markdown-*`. Classes are the routing table, and in a utility-CSS
  host they are also layout control: a note-authored
  `class="fixed inset-0 z-50 bg-white"` is a full-viewport overlay.
- **`id` stays bare for the pipeline, and is namespaced for a note.** Heading and block ids are
  addressable anchors, so a blanket `user-content-` prefix would break every `#heading` link; a
  note's own ids get the prefix, so they cannot shadow one. The pipeline's footnote ids are the
  exception: they are `markdownRender_fn-N` and `markdownRender_fnref-N`, a namespace apart from
  `user-content-`, so a note's raw `id="fn-1"` cannot take a footnote's anchor. A note id whose
  prefixed form is already a pipeline id (a heading slugged `user-content-foo`) is dropped. Every
  attribute the schema allows that points at an id — `aria-describedby`, `aria-labelledby`,
  `headers`, `htmlFor` — moves with it, so a note's references keep resolving and cannot name a
  pipeline anchor. `name` is always prefixed — the pipeline never emits one.
- **`<markdown-embed>` and `<input>` are pipeline-only.** Both are commands
  (fetch a note, rewrite a line of the file), and a hand-written one is
  indistinguishable from a produced one after `rehype-raw`.
- **Routing signals are pipeline-only too.** The classes above are the routing
  table, so allowing them through the schema is what lets a note write
  `<div class="callout">` or `<a class="wikilink" data-path="…">` and reach a
  live component with fields it invented. The *enforce* pass strips them —
  `wikilink*`, `tag`, `callout*`, `math-inline`/`math-display`, `language-*`,
  `markdown-*`, and `data-lang` — from every element the pipeline did not stamp.
  The table is `src/routing-signals.ts`, shared with the Vue router in `@osdlc/markdown-render-vue` so the two
  cannot drift. The consequence is deliberate: raw HTML spelling
  `<pre><code class="language-ts">` is not highlighted, and a raw
  `<div class="callout">` gets no callout chrome.

Anything a note steers a URL with — `href`, `src`, `data-path`,
`data-embed-path` — is scheme-checked by `isSafeLinkPath` / `isSafeAssetUrl`,
including at the point the Vue layer reads it back, because no sanitize schema
polices a `data-*` value.

Extend it rather than disabling it:

```ts
renderToHtml(body, { sanitize: { ...markdownSchema, tagNames: [...markdownSchema.tagNames!, 'my-el'] } })
```

`sanitize: false` exists for content you authored, and nothing else.

### Syntax highlighting

Off unless the host brings a pass. The main entry imports no Shiki; a build
that never imports the `/shiki` subpath ships no Shiki code.

```ts
import { rehypeShiki } from '@osdlc/markdown-render/shiki'

const highlight = rehypeShiki({
  themes: { light: 'github-light', dark: 'github-dark' }, // default
  reservedLangs: ['mermaid', 'base'], // default: RESERVED_FENCE_LANGS
})
await renderToHtml(body, { highlight })
```

`highlight` is any `(tree) => void | Promise<void>` rehype transformer, run
last, after sanitization. `<MarkdownRender>` compares it by identity to reuse
its processor, so hold one instance. `renderToHtmlSync` refuses it.

`rehypeShiki` is fine-grained on purpose: `shiki/core` with the JavaScript regex
engine (no WASM), dynamically imported on the first highlightable fence, one
grammar loaded lazily per language seen. Two themes are loaded together with
`defaultColor: false`, so the output carries `--shiki-light` / `--shiki-dark`
custom properties and switching themes never re-highlights.

Fences with no language, an unknown language, or a reserved one (`mermaid`,
`base`) render plain — those belong to block renderers.

## Theming

`theme.css` defines a `--markdown-*` variable contract with neutral light/dark
fallbacks. Host themes set variables; they do not override selectors. Dark mode
follows `prefers-color-scheme` and a `.dark` ancestor class, which is also what
selects the Shiki theme. A host with its own design tokens bridges them with
`--markdown-*-override: var(--its-token)`, so colors follow its `.dark` class;
the `prefers-color-scheme` fallback is the standalone path.

Every variable is set as `--markdown-<name>-override`:

| Group | Variables |
| --- | --- |
| Document | `text` · `muted` · `surface` |
| Links | `link` · `link-missing` |
| Inline | `tag-bg` · `tag-fg` · `highlight-bg` · `code-bg` |
| Rules | `blockquote-border` · `table-border` · `hr` |
| Callouts | `callout-note` · `callout-info` · `callout-tip` · `callout-warning` · `callout-danger` · `callout-quote` |
| Block chrome | `chrome-fg` · `chrome-bg` · `chrome-hover-bg` · `chrome-border` · `chrome-ok` · `focus-ring` · `chrome-radius` |
| Table extras | `table-header-bg` · `table-max-height` |

`chrome-bg` should be *lighter* than `code-bg` in a dark theme and is the bar's
mask as well as its fill — a long first line passes behind it. `chrome-ok` is
the copied checkmark.

`table-header-bg` fills a table header while it is pinned and defaults to
`surface`. Set it to whatever the rendered note actually sits on: a pinned
header has to be opaque, and one that does not match its ground reads as a
coloured band. It is only ever painted on a table that scrolls.

`chrome-radius` and `table-max-height` are the two non-colour tokens in the
contract. Both are geometry, so neither has a dark-mode value.

## Known dialect deviations

- A bare URL inside `[[…]]` is claimed by GFM autolink literals during parse, so
  `[[https://example.com]]` is an ordinary link. Obsidian has no such syntax
  either.
- Heading and block ids are *not* prefixed with `user-content-`, and footnote
  ids carry `markdownRender_` — see *Sanitization* above.

## Testing

```sh
pnpm test
pnpm run typecheck
```

Both commands work from this package, under Node.

Mermaid's real drawing is verified in the app layer — it wants a browser — but
the seam around it (`createMermaidRenderer`: once-per-theme init, one id
sequence, error propagation) is tested here over a fake module. KaTeX is
verified here: `renderToString` is a pure string function, and what it emits (a
MathML twin plus an `aria-hidden` visual copy) is an accessibility contract
this package owns.

## Licence

`MIT OR Apache-2.0`. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
