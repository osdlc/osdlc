/**
 * Section navigation: helpers over the projected section tree (`DocTree.root` and its nested
 * `SectionNode`s). They find a section by name, slice sections by depth, map a source line to its
 * enclosing section, compute a section's body extent, and collect blocks of one kind.
 *
 * Pure functions over the `SectionNode` and `BlockNode` shapes. Nothing here parses, mutates or
 * reshapes the tree.
 */
import type { BlockNode, SectionNode } from './types.js'

/**
 * The first top-level section in `root.sections` whose `name` matches `name` (a single
 * name, or any alias when an array). `opts.depth` restricts the match to that heading
 * depth; `opts.ci` matches case-insensitively (names are otherwise exact and
 * case-sensitive, as `SectionNode.name` is trimmed heading text).
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
 * The section enclosing a source `line`: the last top-level section (at `opts.depth`, or any
 * depth by default) whose heading `pos.line <= line`. `root.sections` is in document order, so
 * that is the section whose body extends up to (but not into) the next same-depth sibling. It
 * maps a finding's line back to its section.
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

/** A section paired with its 1-indexed body line extent (both bounds inclusive). */
export interface SectionSpan {
  section: SectionNode
  /** first body line — the line after the heading (`pos.line + 1`) */
  start: number
  /** last body line — the line before the next same-depth sibling, or `lineCount` at EOF */
  end: number
}

/**
 * Each section's body extent, for every top-level section at `opts.depth` (default `2`). A
 * section's body runs from the line after its heading (`start = pos.line + 1`) to the line before
 * the next same-depth sibling (`end = next.pos.line - 1`), or to `lineCount` for the last section.
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
 * The section's blocks of a given `kind`, narrowed to the matching `BlockNode` arm. With
 * `opts.recursive`, descends the section's subsection tree (`section.sections`) too, this
 * section's own blocks first.
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
