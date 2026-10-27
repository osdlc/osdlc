/**
 * The slot resolver: which declared slot each section fills, and which block each leaf checks.
 * The structure plane, the content plane and the typed model all read the grammar through it,
 * so they agree on the same document. The Rust crate's `slots.rs` decides the same.
 *
 *   - {@link slotsOf}: a level's `section` and `oneOf` slots, in declared order. Gaps are left
 *     out, and `optional(...)` is unwrapped.
 *   - {@link bindSlots}: each section at a level and the slot it matches. A section matches the
 *     first slot that names it. It fills that slot when the slot is repeatable, or when it is
 *     the first section to match the slot (by any of the slot's spellings). A later one is a
 *     duplicate, which the structure plane reports.
 *   - {@link pickBlock}: the block a leaf checks. A named leaf (a `content` record entry) checks
 *     the block whose `^anchor` is the record key. A single leaf checks the section's first
 *     block.
 */
import type {
  BlockNode,
  GapSpec,
  LeafSpec,
  OneOfSpec,
  OptionalSpec,
  SectionNode,
  SectionOpts,
  SectionSpec,
  Spec,
} from './types.js'

/** A declared `section` or `oneOf` slot, after `optional(...)` is unwrapped. */
export interface Slot {
  /** The index into the level's `specs` array, which includes gaps. */
  specIdx: number
  /** The accepted heading spellings. */
  names: string[]
  optional: boolean
  /** The heading may appear more than once. All occurrences fill this one slot. */
  repeatable: boolean
  /** The fewest occurrences of a repeatable slot, if declared. */
  min?: number
  /** The most occurrences of a repeatable slot, if declared. */
  max?: number
  /** The section options (content, children, rules, anchor), if any. */
  opts?: SectionOpts | undefined
}

/** Unwraps `optional(spec)` to the spec inside it, and says whether it was optional. */
export function unwrapSpec(spec: Spec): {
  inner: SectionSpec | OneOfSpec | GapSpec
  optional: boolean
} {
  if (spec.kind === 'optional') {
    return { inner: unwrapSpec((spec as OptionalSpec).spec).inner, optional: true }
  }
  return { inner: spec, optional: false }
}

/** Builds a slot from a `section` or `oneOf`: names, whether optional, and repeat bounds. */
function makeSlot(
  specIdx: number,
  names: string[],
  optional: boolean,
  opts: SectionOpts | undefined,
): Slot {
  return {
    specIdx,
    names,
    optional: optional || opts?.optional === true,
    repeatable: opts?.repeatable === true,
    ...(opts?.min !== undefined ? { min: opts.min } : {}),
    ...(opts?.max !== undefined ? { max: opts.max } : {}),
    opts,
  }
}

/** The `section` and `oneOf` slots of `specs`, in order. Gaps are left out. */
export function slotsOf(specs: readonly Spec[]): Slot[] {
  const slots: Slot[] = []
  specs.forEach((spec, specIdx) => {
    const { inner, optional } = unwrapSpec(spec)
    if (inner.kind === 'section') {
      const s = inner as SectionSpec
      slots.push(makeSlot(specIdx, s.names, optional, s.opts))
    } else if (inner.kind === 'oneOf') {
      const o = inner as OneOfSpec
      slots.push(makeSlot(specIdx, o.names, optional, o.opts))
    }
  })
  return slots
}

/** The index into `slots` of the first slot whose names include `name`, or `null`. */
export function slotIndexFor(slots: readonly Slot[], name: string): number | null {
  const i = slots.findIndex((s) => s.names.includes(name))
  return i === -1 ? null : i
}

/** A section at one level and the slot it matches. */
export interface SlotBinding {
  node: SectionNode
  /** The index into `slots`, or `null` when the section matches no declared slot. */
  slotIdx: number | null
  /**
   * The section fills its slot: the slot is repeatable, or this is the first section to match
   * it. False for an undeclared section and for a duplicate of a filled slot.
   */
  fills: boolean
}

/** Binds each section in `nodes` to its slot, in document order, as the module header says. */
export function bindSlots(nodes: readonly SectionNode[], slots: readonly Slot[]): SlotBinding[] {
  const filled = new Set<number>()
  return nodes.map((node) => {
    const slotIdx = slotIndexFor(slots, node.name)
    if (slotIdx === null) return { node, slotIdx, fills: false }
    const fills = slots[slotIdx]!.repeatable || !filled.has(slotIdx)
    filled.add(slotIdx)
    return { node, slotIdx, fills }
  })
}

/** True for a single `LeafSpec`, false for a `Record<string, LeafSpec>`. */
export function isLeafSpec(c: LeafSpec | Record<string, LeafSpec>): c is LeafSpec {
  return typeof (c as LeafSpec).kind === 'string'
}

/**
 * The block a leaf checks: the block with `anchor` (a named leaf's record key) when it is set,
 * or `null` if none has it; otherwise the section's first block, or `null` when it has none.
 */
export function pickBlock(node: SectionNode, anchor: string | undefined): BlockNode | null {
  if (anchor !== undefined) return node.blocks.find((b) => b.anchor === anchor) ?? null
  return node.blocks[0] ?? null
}
