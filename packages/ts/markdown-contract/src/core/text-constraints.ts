/**
 * Text check builders: `requires` and `forbids` for one section, and `textRule` for the whole
 * document. Each checks whether a literal or a regex appears in its scope, or does not, the right
 * number of times. They build ordinary `rule` and `docRule` values. The YAML `requires:` and
 * `forbids:` keys compile to these builders, so both forms give the same findings.
 *
 * The matching itself is in `text-match.ts`. The builders choose the text to match:
 *
 *   - `requires(specs)` and `forbids(specs)` return a section `Rule`. The text is every block
 *     (prose, list items, table cells, code) of the section and its subsections, placed on its
 *     source line, so a `forbids` hit reports the real line. The `scopeKey` is the section's
 *     lowerCamelCase key. A `requires` miss or a count problem is placed on the section heading.
 *   - `textRule({ requires?, forbids? })` returns a `DocRule` over the whole document. Its text
 *     is built the same way from `tree.root`, so a `forbids` hit reports the real line. The
 *     `scopeKey` is `"doc"`. A `requires` miss has no position.
 *
 * The text includes the paragraphs, list items, table cells and code blocks in
 * `SectionNode.blocks`. It does not include blockquotes, nested list items, heading text or raw
 * HTML (such as a comment), because `parse()` makes no block for them. A `forbids` aimed at one
 * of those finds nothing. "Whole document" means every section's blocks, including those under
 * the H1.
 *
 * A `requires` entry whose bounds mean absence (`max: 0`, or `max < min`) is an error when the
 * contract is built. Use `forbids` for that. The check runs when `requires(...)` or
 * `textRule(...)` is called, not when a document is validated.
 */
import { toCamelKey } from './camel.js'
import { ContractBuildError } from './grammar.js'
import type { TextMatchSpec } from './text-match.js'
import { buildTextFindings, matchText } from './text-match.js'
import type { BlockNode, Ctx, Doc, DocRule, DocTree, Finding, Rule, SectionNode } from './types.js'

/**
 * One text check entry, the same `TextMatchSpec` the matcher uses. Exactly one of `pattern` (a
 * literal substring) or `regex` (a regex source) gives the text to find. `normalize` and
 * `ignoreCase` change how it matches. `min` and `max` bound the count. `id` names the entry.
 * `note` and `level` shape the finding.
 */
export type { TextMatchSpec } from './text-match.js'

/**
 * The options for `textRule(...)`: `requires` and `forbids` lists of independent checks over the
 * whole document. The YAML `requires:` and `forbids:` keys on the body compile to this.
 */
export interface TextRuleSpec {
  requires?: TextMatchSpec[]
  forbids?: TextMatchSpec[]
}

// ── A `requires` entry may not mean absence ────────────────────────

/** The search text for an error message: `"literal"` for a pattern, `/source/` for a regex. */
function specRepr(spec: TextMatchSpec): string {
  if (spec.regex !== undefined) return `/${spec.regex}/`
  return `"${spec.pattern ?? ''}"`
}

/**
 * Throws for a `requires` entry whose bounds mean absence: `max: 0`, or a `max` below the
 * entry's minimum (`min`, default and at least 1). "This scope must not contain X" is a
 * `forbids` check. It throws when the contract is built, like the other `ContractBuildError`s.
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

// ── Building the scope text, line by line ────────────────────────────────────────────

/**
 * Collects text at 1-based source lines and renders one string with the same line breaks as the
 * source, so match positions fall on real source lines. A piece of text may span several lines
 * (a wrapped paragraph). Each of its lines goes on the next source line. Two pieces on one line
 * are joined by a space.
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

/** Places one block's text on its source lines. */
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
 * The text of every block (prose, list items, table cells, code) in this section and its
 * subsections, each on its source line. It reads the `SectionNode`, not the `SectionView`,
 * because the node has each block's position, so a `forbids` hit reports the real line.
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

/** The text of the whole document, each block on its source line. */
function docScopeText(tree: DocTree): string {
  return sectionScopeText(tree.root)
}

// ── The builders ───────────────────────────────────────────────────────────────────────

/**
 * A section rule that requires each listed phrase in the section and its subsections. Put it in
 * a section's `rules: [...]`. It is the code form of a section's YAML `requires:`. Each entry
 * gives a `text/requires` finding on the section heading when its phrase is missing, or
 * `text/count` when a `min` or `max` is not met. An entry with `max: 0` or `max < min` throws when
 * built. Use {@link forbids} for that.
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
 * A section rule that forbids each listed phrase in the section and its subsections. Put it in a
 * section's `rules: [...]`. It is the code form of a section's YAML `forbids:`. Each entry gives
 * a `text/forbids` finding on the line of every hit, or `text/count` on the heading when there
 * are more than a positive `max`.
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
 * A document rule with required and forbidden phrase checks over the whole document. Put it in a
 * contract's `rules: [...]`. It is the code form of the YAML `requires:` and `forbids:` on the
 * body. Each `requires` entry gives a `text/requires` with no position when its phrase is
 * missing. Each `forbids` entry gives a `text/forbids` on the line of every hit. The `requires`
 * entries have the same limit as in {@link requires}.
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
