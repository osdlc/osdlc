/**
 * Helpers over the section tree (`DocTree.root` and its nested `SectionNode`s). They find a
 * section by name, list sections at a depth, map a source line to its section, compute a
 * section's body lines, and collect blocks of one kind.
 *
 * Nothing here parses or changes the tree.
 */
import type { BlockNode, SectionNode } from './types.js'

/**
 * The first section in `root.sections` whose `name` matches `name` (one name, or any of them
 * when an array). `opts.depth` limits the match to that heading depth. `opts.ci` ignores case.
 * Otherwise names match exactly, case included. `SectionNode.name` is the trimmed heading text.
 *
 * For example, `findSection(root, "Operations", { depth: 2 })`.
 */
export function findSection(
  root: SectionNode,
  name: string | string[],
  opts?: { depth?: number; ci?: boolean },
): SectionNode | undefined {
  const ci = opts?.ci ?? false
  const norm = (s: string): string => (ci ? s.toLowerCase() : s)
  const targets = new Set((Array.isArray(name) ? name : [name]).map(norm))
  return root.sections.find(
    (s) => (opts?.depth === undefined || s.depth === opts.depth) && targets.has(norm(s.name)),
  )
}

/**
 * The top-level sections at a given heading depth — `root.sections.filter(s => s.depth === depth)`.
 */
export function sectionsAt(root: SectionNode, depth: number): SectionNode[] {
  return root.sections.filter((s) => s.depth === depth)
}

/**
 * The section that contains a source `line`: the last section in `root.sections` (at
 * `opts.depth`, or any depth by default) whose heading `pos.line <= line`. `root.sections` is in
 * document order, so this is the section whose body runs up to the next sibling. Use it to map a
 * finding's line back to its section.
 */
export function sectionForLine(
  root: SectionNode,
  line: number,
  opts?: { depth?: number },
): SectionNode | undefined {
  const candidates =
    opts?.depth === undefined ? root.sections : root.sections.filter((s) => s.depth === opts.depth)
  let enclosing: SectionNode | undefined
  for (const s of candidates) {
    if (s.pos.line <= line) enclosing = s
    else break
  }
  return enclosing
}

/** A section and its body lines, 1-based, both bounds included. */
export interface SectionSpan {
  section: SectionNode
  /** The first body line: the line after the heading (`pos.line + 1`). */
  start: number
  /** The last body line: the line before the next sibling at the same depth, or `lineCount`. */
  end: number
}

/**
 * The body lines of every section in `root.sections` at `opts.depth` (default `2`). A body runs
 * from the line after its heading (`start = pos.line + 1`) to the line before the next sibling
 * at the same depth (`end = next.pos.line - 1`), or to `lineCount` for the last section.
 */
export function sectionSpans(
  root: SectionNode,
  lineCount: number,
  opts?: { depth?: number },
): SectionSpan[] {
  const depth = opts?.depth ?? 2
  const secs = root.sections.filter((s) => s.depth === depth)
  return secs.map((section, i) => {
    const next = secs[i + 1]
    return {
      section,
      start: section.pos.line + 1,
      end: next ? next.pos.line - 1 : lineCount,
    }
  })
}

/**
 * The section's blocks of one `kind`, typed as that `BlockNode` variant. With `opts.recursive`,
 * it also collects from the subsections (`section.sections`), after this section's own blocks.
 */
export function blocksOfKind<K extends BlockNode['kind']>(
  section: SectionNode,
  kind: K,
  opts?: { recursive?: boolean },
): Array<Extract<BlockNode, { kind: K }>> {
  const out: Array<Extract<BlockNode, { kind: K }>> = []
  const visit = (sec: SectionNode): void => {
    for (const b of sec.blocks) {
      if (b.kind === kind) out.push(b as Extract<BlockNode, { kind: K }>)
    }
    if (opts?.recursive) for (const child of sec.sections) visit(child)
  }
  visit(section)
  return out
}
