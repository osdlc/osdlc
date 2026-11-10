/**
 * The chrome this package draws inside a rendered note, as one selector.
 *
 * ## Why this is exported at all
 *
 * A host that walks the rendered DOM — an in-note find, a reading-time
 * estimate, a text extractor — has to tell the note's TEXT apart from the
 * controls this package renders around it. Every one of those classes is
 * internal to this package, so a host that spelled them out for itself would
 * be encoding a private contract from the outside: rename `markdown-code-chrome`
 * here and the host silently starts counting the fence's language label as
 * prose, with no compile error anywhere. Naming the set here, next to the
 * components that draw it, makes the rename a two-file edit instead of a
 * silent behaviour change — and `tests/chrome.test.ts` renders each component
 * and asserts its chrome still matches, so the contract breaks loudly.
 *
 * ## What is IN
 *
 * Controls (`copyButton`, the two fold toggles), their confirmation live
 * regions, decoration the reader is not meant to read (the sort arrow), text
 * this package SYNTHESIZES rather than takes from the note (the `Column N`
 * placeholder, every embed placeholder), and KaTeX's clipped MathML twin,
 * which exists only because `MathBlock` asks for `htmlAndMathml`.
 *
 * ## What is deliberately OUT
 *
 * `.markdown-table-sort` is a `<button>`, but it WRAPS the header cell's real
 * text — skipping it would make every sortable table's headers invisible to a
 * host. `.markdown-embed-note` is the embedded note's own body. `.katex-html`
 * is the equation the reader actually sees. `.markdown-mermaid-fallback` is the
 * note's own fence source, shown because the diagram would not render.
 */

/**
 * One CSS selector matching every chrome element above. Intended for
 * `element.matches()` during a walk, where a hit means "prune this subtree".
 */
export const RENDER_CHROME_SELECTOR = [
  // Fold controls — `HeadingSectionFold`, `ListItemFold`.
  '.markdown-heading-fold-toggle',
  '.markdown-list-fold-toggle',
  // Code fence chrome — `CodeBlock`: the language label and both buttons live
  // inside the chrome bar, and the copy confirmation is its own live region.
  '.markdown-code-chrome',
  '.markdown-code-status',
  // Table chrome — `TableBlock`: the copy-as-CSV button, its confirmation, the
  // sort direction arrow, and the synthesized name for a header with no text.
  '.markdown-table-chrome',
  '.markdown-table-status',
  '.markdown-table-arrow',
  '.markdown-table-sort-name',
  // Embed placeholders — `Embed`. Every one of these is a sentence
  // this package wrote, not a line of the note.
  '.markdown-embed-loading',
  '.markdown-embed-missing',
  '.markdown-embed-cycle',
  '.markdown-embed-too-deep',
  '.markdown-embed-over-budget',
  '.markdown-embed-inert',
  // KaTeX's semantic twin — `MathBlock`. Clipped out of view, and holding both
  // a second copy of the equation's characters and its `<annotation>` TeX
  // source. A host that walked it would double every equation and offer hits
  // on `\frac` that it can never scroll to.
  '.katex-mathml',
].join(',')
