# @osdlc/markdown-render-vue

Vue 3 components for [`@osdlc/markdown-render`](../markdown-render): a
`<MarkdownRender>` component that walks the renderer's hast tree into VNodes
(never `v-html`), with built-in components for wikilinks, tags, embeds,
callouts, task boxes, math, mermaid diagrams, code blocks and tables, and an
injected `NoteSource` for link resolution and embed loading. The markdown
pipeline, the dialect and the sanitizer live in `@osdlc/markdown-render`; this
package is only the Vue layer over its output.

## Install

```sh
npm install @osdlc/markdown-render-vue @osdlc/markdown-render vue
```

`vue` (^3.5) is a required peer dependency. `katex` (math) and `mermaid`
(diagrams) are optional peers, resolved by `@osdlc/markdown-render`; install the
ones you use. Node 22 or later for SSR and builds, and any modern browser at
runtime.

## Who it is for

Vue 3 apps that show markdown notes with Obsidian's dialect: note-reading
views, previews beside an editor, and wiki-style apps. For HTML strings, Astro
or static builds, use `@osdlc/markdown-render` alone.

## Stability

The package is 0.x: a minor release may break the API. `defaultComponents`,
`groupHeadingSections` and `renderHeadingSections` are experimental host
contracts and may change in a minor release.

## Vue usage

```ts
import { MarkdownRender, provideNoteSource } from '@osdlc/markdown-render-vue'
import '@osdlc/markdown-render/theme.css'
// KaTeX users must also import 'katex/dist/katex.min.css' — it sizes the
// glyphs, and `theme.css` alone will render math legibly but wrong.

provideNoteSource({
  resolveLink,
  async loadNote(path) { return { body: await readNote(path) } },
  assetUrl(target) { return `/vault-assets/${target}` },
})
```

```vue
<MarkdownRender
  :source="body"
  :note-path="path"
  :components="{ 'lang:base': BasesBlock }"
  @link-click="({ resolution }) => router.push(resolution.path)"
  @link-hover="showPreviewPopover"
  @tag-click="searchTag"
  @task-toggle="({ line, checked }) => writeCheckbox(line, checked)"
  @rendered="({ outline }) => (toc = outline)"
/>
```

The hast tree is walked into VNodes with `h()` — never `v-html`. Overrides are
routed by key, most specific first:

`markdown-embed` · `lang:<fence-language>` · `math-inline` · `a.wikilink` ·
`a.tag` · `div.callout` · `input.checkbox` · `<tagName>`

The `components` prop merges over the built-ins, which is how a host injects a
Bases block renderer for ` ```base ` fences, a custom link chip, or a different
callout chrome. Every routed component receives the hast node as its `node` prop
and its rendered children as the default slot. A map entry may also be
`undefined`, which turns a built-in route back OFF — routing skips a falsy entry
and falls through to the plain element.

Two built-ins claim an ordinary HTML tag and give the block the chrome a reader
wants on one.

**`pre` → `CodeBlock`.** Every code fence gets a language label, a copy button
and a per-block soft-wrap toggle, revealed on hover and on `:focus-within`. A
fence is now
`<div class="markdown-code-block"><div class="markdown-code-chrome">…</div><pre>…</pre>…</div>`,
so a selector written as `.markdown-render > pre` no longer matches. The block's
vertical margin lives on the wrapper and the `<pre>`'s is zeroed, because half
the chrome bar hangs in that margin.

**`table` → `TableBlock`.** Every table gets a click-to-sort header (ascending, then descending,
then the document's own order back), a header that pins while a long body scrolls, and a copy button
that writes RFC 4180 CSV in the order currently displayed. A table is now
`<div class="markdown-table-block"><div class="markdown-table-chrome">…</div><table>…</table><span class="markdown-table-status">…</span></div>`;
each `<th>` carries `aria-sort` and holds a `<button class="markdown-table-sort">` that takes its
accessible name from the header content it wraps (never an `aria-label`, which would rename the
`<th>` for every cell in the column), and the wrapper gains `markdown-table-scrolls` once the table
overflows `--markdown-table-max-height`. A table with a `colspan` or `rowspan` gets the copy button
but no sort controls: a span means the n-th header no longer names the n-th value in each row, and
sorting the wrong column under a confident label is worse than not sorting. The wrapper adds no
margin of its own, so a table short enough not to scroll occupies exactly the space it did before.
All three are lenses: sort state is per-table and ephemeral (it resets when the table's source
changes, not on a host redraw of the same source), a cell contributes its DISPLAY text to both the
sort key and the CSV — a wikilink's label, not its target — and nothing is ever written back.
Sorting permutes the rendered VNodes, so it cannot reach hast, let alone a file.

Both are **opt-out**: `:components="{ pre: undefined, table: undefined }"`
restores the bare elements. Do that anywhere the rendered note is decorative or
non-interactive — a `role="tooltip"` hover card, say, where `pointer-events:
none` hides the chrome from a mouse but leaves its buttons in the tab order.

Chrome is Vue-only. It is never emitted into hast, so `renderToHtml`'s string
output is byte-identical with or without it and the sanitizer's allowlist is
unchanged. A fence claimed by a `lang:` route (`mermaid`, `math`, a host's
`base`) keeps its own renderer and gets no chrome.

`MermaidBlock` takes either `node` (the fence, as routed) or `source` (diagram
text, for a host that has no hast node: `<MermaidBlock :source="code" theme="dark" />`).
`theme` applies to both; when both are given, `source` is the text and `node`
only supplies `data-line`. A mermaid error shows the source text in
`<pre class="markdown-mermaid-fallback">` instead of the diagram.

Rendering is asynchronous; the previous tree stays on screen until the next one
is ready, and a monotonic render id drops stale results.

`<Embed>` loads through `NoteSource.loadNote`, slices by heading or block
id, and renders a nested `<MarkdownRender>`. Three guards bound it, and all
three render a placeholder instead of throwing: an ancestor-path chain catches
cycles (including indirect ones), a depth cap of 5 stops runaway nesting, and a
document-wide budget of 128 transclusions stops runaway *width* — depth alone
bounds nothing, since N embeds nested D deep is N^D loads with every one of them
inside the cap. Media embeds are free of the budget: they neither load nor
recurse, and render as `<img>`, `<video>`, `<audio>`, or — for a PDF — a link.

`NoteSource.loadNote` receives a path that originated in note text, so an
implementation must check it against its own store rather than concatenating it
onto a root. The renderer refuses URL schemes it will not act on and hands the
method nothing but its own pipeline's output, but it has no idea what a
traversal means to your backing store.

Styling comes from `@osdlc/markdown-render/theme.css`, which defines the
`--markdown-*` variable contract (see *Theming* in that package's README).

## Known deviations

- `useNoteSource()` returns `undefined` when no host installed one; the renderer
  still works, it just cannot resolve links or load embeds.
- Task checkboxes render enabled (GFM emits them disabled). The component
  reports `task-toggle` and reverts the DOM flip — the host owns the state, so
  the rendered document stays a pure function of the source. Inside a
  transclusion they stay disabled: `task-toggle` does not cross the embed
  boundary, so a live box there would do nothing.

## Testing

```sh
pnpm test
pnpm run typecheck
```

Both commands work from this package, under Node. Components are mounted against jsdom:
the component test files opt in with a `// @vitest-environment jsdom` docblock
(jsdom replaces the global `URL`, which breaks file-URL tests, so it is not
the default), and `tests/setup-dom.ts` hands out Vue via a dynamic import
because `@vue/runtime-dom` captures `document` at module-init time. Every test
module that needs Vue takes it from there.

## Licence

`MIT OR Apache-2.0`. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
