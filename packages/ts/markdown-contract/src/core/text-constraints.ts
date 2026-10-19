/**
 * Declarative text-constraint builders — `requires` / `forbids` (section-scoped) and
 * `textRule` (document-scoped). They attach required / forbidden phrase checks to a contract,
 * compiling to the engine's existing node-local `rule` / cross-plane `docRule` machinery:
 * "does this literal-or-regex appear (or not) in this scope, the right
 * number of times?". This is the TS-API surface the declarative `requires:` / `forbids:` YAML
 * keys compile to, so both authoring surfaces share one implementation and one set of findings.
 *
 * Each builder is a thin scope-resolver over the text-match core (`text-match.ts`):
 *
 *   - `requires(specs)` / `forbids(specs)` → a node-local `Rule`. The matcher runs over the
 *     bound section's *subtree text* (every block — prose, list items, table cells, code — of
 *     the section and its descendants, reconstructed line-faithfully from the projected
 *     `SectionNode` so a `forbids` hit reports its real source line). The `scopeKey` is the
 *     section's generated lowerCamelCase key; a `requires` miss / count violation pins at the
 *     section heading.
 *   - `textRule({ requires?, forbids? })` → a cross-plane `DocRule` over the WHOLE document.
 *     The `DocRule` receives the projected `DocTree`, so the whole-document text is
 *     reconstructed line-faithfully from the projected tree (`tree.root`) — a whole-document
 *     `forbids` hit therefore anchors at the exact offending source line. The `scopeKey` is the
 *     literal `"doc"`; a `requires` miss is document-level (no position).
 *
 * What the matcher sees: the text of the paragraphs, list items, table cells and code blocks that
 * the projection holds in `SectionNode.blocks`. It does not see a blockquote, a nested list item,
 * a heading's own text or raw HTML (such as a comment), because the projection builds no block
 * from them. A `forbids` aimed at one of those finds nothing. "Whole document" means every
 * section's blocks, including those under the H1.
 *
 * Purity: a `requires` entry whose bound expresses ABSENCE (`max: 0`, or `max < min`)
 * is a constructor-time error — the absence form is `forbids`. The check fires when `requires(...)`
 * (or the `requires` arm of `textRule(...)`) is *called*, not at validation time.
 */
import { toCamelKey } from './camel.js'
import { ContractBuildError } from './grammar.js'
import type { TextMatchSpec } from './text-match.js'
import { buildTextFindings, matchText } from './text-match.js'
import type { BlockNode, Ctx, Doc, DocRule, DocTree, Finding, Rule, SectionNode } from './types.js'

/**
 * One required / forbidden text-match entry — the closed match-spec vocabulary. This is the matcher's `TextMatchSpec` re-exported verbatim, so the authoring
 * surface and the matcher core never diverge: exactly one of `pattern` (a literal substring) or
 * `regex` (a regex source) supplies the needle; `normalize` / `ignoreCase` tune matching;
 * `min` / `max` bound the count; `id` pins identity; `note` / `level` shape the finding.
 */
export type { TextMatchSpec } from './text-match.js'

/**
 * The document-scoped options for `textRule(...)` — `requires` / `forbids` lists, each a set of
 * independent whole-document checks (the body-root form of the YAML `requires:` / `forbids:`).
 */
export interface TextRuleSpec {
  requires?: TextMatchSpec[]
  forbids?: TextMatchSpec[]
}

// ── Purity: a `requires` entry may not express absence ────────────────────────

/** The needle as it reads in an error message — `"literal"` for a pattern, `/source/` for a regex. */
function specRepr(spec: TextMatchSpec): string {
  if (spec.regex !== undefined) return `/${spec.regex}/`
  return `"${spec.pattern ?? ''}"`
}

/**
 * Reject a `requires` entry whose count bound expresses ABSENCE — `max: 0`, or any `max` below
 * the entry's effective minimum (`min`, default 1). A "this scope must NOT contain X" check is
 * the `forbids` form, not a `requires` with `max: 0`. Thrown at construction (a contract-authoring
 * error), mirroring `grammar.ts`'s build-time `ContractBuildError` convention.
 */
function assertRequiresPurity(specs: TextMatchSpec[]): void {
  for (const spec of specs) {
    const floor = Math.max(spec.min ?? 1, 1)
    if (spec.max !== undefined && spec.max < floor) {
      throw new ContractBuildError(
        'contract/text-requires-purity',
        `requires(${specRepr(spec)}): a requires entry may not express absence ` +
          `(max ${spec.max} < ${floor}); use forbids(...) for an absence check`,
      )
    }
  }
}

// ── Line-faithful scope-text reconstruction ────────────────────────────────────────────

/**
 * Accumulates text fragments at their 1-based source lines and renders them into one string
 * whose newline structure mirrors the source — so the matcher's positions land on real source
 * lines. A fragment may itself be multi-line (a paragraph's soft-wrapped prose); each of its
 * lines is placed on a consecutive source line. Two fragments on one line are space-joined.
 */
class LineBuffer {
  private lines: string[] = []

  place(line: number, text: string): void {
    if (text === '') return
    const parts = text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      const idx = line - 1 + i
      if (idx < 0) continue
      while (this.lines.length <= idx) this.lines.push('')
      const existing = this.lines[idx]!
      this.lines[idx] = existing === '' ? parts[i]! : `${existing} ${parts[i]!}`
    }
  }

  render(): string {
    return this.lines.join('\n')
  }
}

/** Place one projected block's text at its real source line(s). */
function placeBlock(buf: LineBuffer, block: BlockNode): void {
  switch (block.kind) {
    case 'paragraph':
      buf.place(block.pos.line, block.text)
      break
    case 'list':
      for (const item of block.items) buf.place(item.pos.line, item.text)
      break
    case 'code':
      buf.place(block.pos.line, block.value)
      break
    case 'table':
      buf.place(block.pos.line, block.columns.join(' '))
      block.rows.forEach((row, i) => {
        buf.place(block.rowPos(i).line, row.join(' '))
      })
      break
  }
}

/**
 * The section's subtree text, reconstructed line-faithfully from the projected `SectionNode`:
 * every block (prose, list items, table cells, code) of this section and every descendant,
 * placed at its real source line. Built from the `SectionNode` (not the typed `SectionView`),
 * so per-block positions are exact and a `forbids` hit reports its true source line.
 */
function sectionScopeText(node: SectionNode): string {
  const buf = new LineBuffer()
  const walk = (n: SectionNode): void => {
    for (const block of n.blocks) placeBlock(buf, block)
    for (const child of n.sections) walk(child)
  }
  walk(node)
  return buf.render()
}

/** The whole-document scope text, reconstructed line-faithfully from the projected tree. */
function docScopeText(tree: DocTree): string {
  return sectionScopeText(tree.root)
}

// ── The builders ───────────────────────────────────────────────────────────────────────

/**
 * Require each listed phrase to be PRESENT in the bound section's subtree text — a node-local
 * `Rule` for a section's `rules: [...]` slot (the section-scoped form of the YAML `requires:`).
 * Each entry emits its own `text/requires` finding at the section heading when its phrase is
 * absent (or `text/count` when a `min` / `max` bound is violated). Rejects an absence-form
 * entry (`max: 0` / `max < min`) at construction (use {@link forbids}).
 *
 * @param specs The phrases, each with its own options.
 * @throws {ContractBuildError} When an entry's bound expresses absence (`max: 0`, or `max` below `min`).
 */
export function requires(specs: TextMatchSpec[]): Rule {
  assertRequiresPurity(specs)
  return {
    __brand: 'Rule',
    id: 'text/requires',
    run(node: SectionNode, ctx: Ctx): Finding[] {
      const scopeKey = toCamelKey(node.name)
      const text = sectionScopeText(node)
      const out: Finding[] = []
      for (const spec of specs) {
        out.push(
          ...buildTextFindings({
            kind: 'requires',
            spec,
            match: matchText(text, spec),
            scopeKey,
            scope: node.name,
            scopePos: node.pos,
            ctx,
          }),
        )
      }
      return out
    },
  }
}

/**
 * Forbid each listed phrase from appearing in the bound section's subtree text — a node-local
 * `Rule` for a section's `rules: [...]` slot (the section-scoped form of the YAML `forbids:`).
 * Each entry emits a `text/forbids` finding at the offending line for every hit (or `text/count`
 * at the heading when a positive `max` cap is exceeded). `forbids` is the absence form, so there
 * is no purity restriction.
 */
export function forbids(specs: TextMatchSpec[]): Rule {
  return {
    __brand: 'Rule',
    id: 'text/forbids',
    run(node: SectionNode, ctx: Ctx): Finding[] {
      const scopeKey = toCamelKey(node.name)
      const text = sectionScopeText(node)
      const out: Finding[] = []
      for (const spec of specs) {
        out.push(
          ...buildTextFindings({
            kind: 'forbids',
            spec,
            match: matchText(text, spec),
            scopeKey,
            scope: node.name,
            scopePos: node.pos,
            ctx,
          }),
        )
      }
      return out
    },
  }
}

/**
 * Attach required / forbidden phrase checks to the WHOLE document — a cross-plane `DocRule` for
 * a contract's `rules: [...]` slot (the body-root form of the YAML `requires:` / `forbids:`).
 * Each `requires` entry emits a document-level `text/requires` (no position) when its phrase is
 * absent; each `forbids` entry emits a `text/forbids` at the offending line for every hit. The
 * `requires` arm enforces the same absence-form purity as {@link requires}.
 *
 * @param spec The `requires` and `forbids` lists.
 * @throws {ContractBuildError} When a `requires` entry's bound expresses absence (`max: 0`, or `max` below `min`).
 */
export function textRule(spec: TextRuleSpec): DocRule {
  const requiresSpecs = spec.requires ?? []
  const forbidsSpecs = spec.forbids ?? []
  assertRequiresPurity(requiresSpecs)
  return {
    __brand: 'DocRule',
    id: 'text/doc',
    run(doc: Doc, ctx: Ctx, tree: DocTree): Finding[] {
      const text = docScopeText(tree)
      const out: Finding[] = []
      for (const s of requiresSpecs) {
        out.push(
          ...buildTextFindings({
            kind: 'requires',
            spec: s,
            match: matchText(text, s),
            scopeKey: 'doc',
            ctx,
          }),
        )
      }
      for (const s of forbidsSpecs) {
        out.push(
          ...buildTextFindings({
            kind: 'forbids',
            spec: s,
            match: matchText(text, s),
            scopeKey: 'doc',
            ctx,
          }),
        )
      }
      return out
    },
  }
}
