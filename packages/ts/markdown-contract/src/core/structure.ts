/**
 * The structure plane: matches the section tree against the body grammar.
 *
 * `matchStructure(tree, body, ctx)` walks the section tree against each level's ordered
 * `Spec[]`, and the `children` below, and reports the `structure/*` findings:
 *
 *   - section presence         — `structure/section-missing`
 *   - order                    — `structure/section-order` (from `order`, `allowUnknown`, gaps)
 *   - gap counts               — `structure/gap-count`
 *   - repeat counts            — `structure/repeat-count`
 *   - duplicates and aliases   — `structure/duplicate-section`
 *   - camelCase collisions     — `structure/key-collision`
 *   - block kind               — `structure/block-missing`, `structure/block-kind`
 *   - anchors                  — `structure/anchor-missing`
 *   - section rules            — each `rule(...)` runs here
 *
 * Whether a block is present and of the right kind is structure. The block's data is content.
 * This plane reads only `LeafSpec.kind`. It never runs a Zod schema.
 *
 * Hints: each level's hint is its own `description`, else the one inherited from above, and it
 * is passed down. A finding about a slot uses the slot's description first. Findings are made
 * through a `withHint` `Ctx`, so a contract with no descriptions gives findings with no `hint`
 * key.
 */
import { toCamelKey } from './camel.js'
import { withHint } from './registry.js'
import type {
  BlockKind,
  BlockNode,
  Ctx,
  Finding,
  GapSpec,
  LeafSpec,
  OneOfSpec,
  OptionalSpec,
  SectionNode,
  SectionOpts,
  SectionSeq,
  SectionSpec,
  Spec,
} from './types.js'

// ── Reading the specs ──────────────────────────────────────────────────────

/** A declared `section` or `oneOf` slot, after `optional(...)` is unwrapped. */
interface Slot {
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
function unwrap(spec: Spec): { inner: SectionSpec | OneOfSpec | GapSpec; optional: boolean } {
  if (spec.kind === 'optional') {
    const u = unwrap((spec as OptionalSpec).spec)
    return { inner: u.inner, optional: true }
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
function slotsOf(specs: readonly Spec[]): Slot[] {
  const slots: Slot[] = []
  specs.forEach((spec, specIdx) => {
    const { inner, optional } = unwrap(spec)
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

/** The index of the first slot whose names include `name`, or -1 when none does. */
function slotForName(slots: Slot[], name: string): number {
  return slots.findIndex((s) => s.names.includes(name))
}

/** True when `name` matches a repeatable slot, so a repeat of it is allowed. */
function isRepeatableName(slots: Slot[], name: string): boolean {
  return slots.some((s) => s.repeatable && s.names.includes(name))
}

// ── Matching one level ──────────────────────────────────────────────────────────

/** A document section and the slot it matches. */
interface Assigned {
  node: SectionNode
  /** The index into `slots`, or `null` when the section matches no declared slot. */
  slotIdx: number | null
}

/**
 * Reports repeated headings and camelCase key collisions at one level. A heading that matches
 * a repeatable slot may repeat, so it gets neither `structure/duplicate-section` nor
 * `structure/key-collision`. Every other heading must be unique at its level.
 */
function checkDuplicateHeadings(
  nodes: SectionNode[],
  slots: Slot[],
  ctx: Ctx,
  out: Finding[],
): void {
  const seenName = new Map<string, SectionNode>()
  const seenKey = new Map<string, string>() // camelKey → first heading text
  for (const node of nodes) {
    if (seenName.has(node.name)) {
      if (!isRepeatableName(slots, node.name)) {
        out.push(
          ctx.finding({
            id: 'structure/duplicate-section',
            message: `duplicate section ‘${node.name}’; a heading must not repeat at one level`,
            pos: node.pos,
          }),
        )
      }
      continue // its key is already recorded
    }
    seenName.set(node.name, node)
    const key = toCamelKey(node.name)
    if (key === '') continue
    const firstHeading = seenKey.get(key)
    if (firstHeading === undefined) {
      seenKey.set(key, node.name)
    } else if (firstHeading !== node.name && !isRepeatableName(slots, node.name)) {
      out.push(
        ctx.finding({
          id: 'structure/key-collision',
          message: `‘${node.name}’ and ‘${firstHeading}’ collapse to the same key ‘${key}’; headings must yield distinct keys at one level`,
          pos: node.pos,
        }),
      )
    }
  }
}

/**
 * Reports a repeatable slot whose number of occurrences is outside its `min` or `max`
 * (`structure/repeat-count`). The `max` finding is placed on the first extra occurrence. The
 * `min` check applies only when the slot is present. A required slot with no occurrences gets
 * `structure/section-missing` instead.
 */
function checkRepeatBounds(
  nodes: SectionNode[],
  slots: Slot[],
  ctx: Ctx,
  out: Finding[],
  levelHint: string | undefined,
): void {
  for (const slot of slots) {
    if (!slot.repeatable) continue
    if (slot.min === undefined && slot.max === undefined) continue
    emitRepeatBound(slot, nodes, withHint(ctx, slot.opts?.description ?? levelHint), out)
  }
}

/** Reports `structure/repeat-count` for one repeatable slot, as `checkRepeatBounds` describes. */
function emitRepeatBound(slot: Slot, nodes: SectionNode[], ctx: Ctx, out: Finding[]): void {
  const matches = nodes.filter((n) => slot.names.includes(n.name))
  const count = matches.length
  const label = slot.names.join('’ / ‘')
  if (slot.max !== undefined && count > slot.max) {
    const offender = matches[slot.max] // the first extra occurrence
    out.push(
      ctx.finding({
        id: 'structure/repeat-count',
        message: `repeatable section ‘${label}’ occurs ${count} times; expected at most ${slot.max}`,
        ...(offender ? { pos: offender.pos } : {}),
      }),
    )
  } else if (slot.min !== undefined && count > 0 && count < slot.min) {
    const first = matches[0]
    out.push(
      ctx.finding({
        id: 'structure/repeat-count',
        message: `repeatable section ‘${label}’ occurs ${count} times; expected at least ${slot.min}`,
        ...(first ? { pos: first.pos } : {}),
      }),
    )
  }
}

/**
 * Matches one level: `nodes` (the sibling sections at this depth) against `seq`. Adds findings
 * to `out`, then checks the `children` of declared sections. `inheritedHint` is the nearest
 * description above this level. The level's own `opts.description`, if any, replaces it for
 * everything below.
 */
function matchLevel(
  nodes: SectionNode[],
  seq: SectionSeq,
  ctx: Ctx,
  out: Finding[],
  inheritedHint?: string,
): void {
  const specs = seq.specs
  const order = seq.opts.order ?? 'none'
  const allowUnknown = seq.opts.allowUnknown ?? true
  const slots = slotsOf(specs)
  const levelHint = seq.opts.description ?? inheritedHint
  const lctx = withHint(ctx, levelHint)

  checkDuplicateHeadings(nodes, slots, lctx, out)

  // Match each section to the first slot that names it.
  const assigned: Assigned[] = nodes.map((node) => ({
    node,
    slotIdx: slotForOrNull(slots, node.name),
  }))

  checkAliasAmbiguity(assigned, slots, lctx, out)
  checkMissingSlots(assigned, slots, nodes, ctx, out, levelHint)
  checkRepeatBounds(nodes, slots, ctx, out, levelHint)
  checkOrderAndUnknowns(order, allowUnknown, nodes, specs, slots, assigned, lctx, out)
  runPresentSlotChecks(assigned, slots, ctx, out, levelHint)
}

/**
 * Reports a second, different spelling of a slot with several names (a `oneOf` or
 * `section([...])`) when the slot is already filled.
 */
function checkAliasAmbiguity(assigned: Assigned[], slots: Slot[], ctx: Ctx, out: Finding[]): void {
  const slotBoundBy = new Map<number, string>() // slotIdx → the heading that filled it first
  for (const a of assigned) {
    if (a.slotIdx === null) continue
    const slot = slots[a.slotIdx]!
    if (slot.repeatable) continue // a repeatable slot accepts every spelling
    if (slot.names.length <= 1) continue // checkDuplicateHeadings covers a single spelling
    const boundHeading = slotBoundBy.get(a.slotIdx)
    if (boundHeading === undefined) {
      slotBoundBy.set(a.slotIdx, a.node.name)
    } else if (boundHeading !== a.node.name) {
      out.push(
        ctx.finding({
          id: 'structure/duplicate-section',
          message: `‘${a.node.name}’ is a second spelling of an alias set already filled by ‘${boundHeading}’; supply exactly one`,
          pos: a.node.pos,
        }),
      )
    }
  }
}

/** Reports each required slot that no section filled (`structure/section-missing`). */
function checkMissingSlots(
  assigned: Assigned[],
  slots: Slot[],
  nodes: SectionNode[],
  ctx: Ctx,
  out: Finding[],
  levelHint: string | undefined,
): void {
  const filledSlots = new Set<number>()
  for (const a of assigned) if (a.slotIdx !== null) filledSlots.add(a.slotIdx)
  slots.forEach((slot, slotIdx) => {
    if (slot.optional) return
    if (filledSlots.has(slotIdx)) return
    // A missing section has no line of its own. Use the first body heading, or no `pos` when
    // the body has no headings.
    const firstHeading = nodes[0]
    out.push(
      withHint(ctx, slot.opts?.description ?? levelHint).finding({
        id: 'structure/section-missing',
        message: `required section ‘${slot.names.join('’ / ‘')}’ is missing`,
        ...(firstHeading ? { pos: firstHeading.pos } : {}),
      }),
    )
  })
}

/**
 * Checks order and undeclared sections. `recognized-relative` and `strict` run their order check.
 * Then, on a level that is not `strict` and has `allowUnknown: false`, each undeclared section is
 * reported unless a gap allows it. On such a level every undeclared section counts toward the one
 * gap. `order: "none"` with `allowUnknown: true` allows everything.
 */
function checkOrderAndUnknowns(
  order: 'none' | 'recognized-relative' | 'strict',
  allowUnknown: boolean,
  nodes: SectionNode[],
  specs: readonly Spec[],
  slots: Slot[],
  assigned: Assigned[],
  ctx: Ctx,
  out: Finding[],
): void {
  if (order === 'recognized-relative') {
    checkRecognizedRelative(assigned, ctx, out)
  } else if (order === 'strict') {
    checkStrict(nodes, specs, slots, allowUnknown, ctx, out)
  }

  if (order === 'strict' || allowUnknown) return

  // Undeclared sections are allowed only at a gap. With no gap, each one is reported.
  const hasGap = specs.some((s) => unwrap(s).inner.kind === 'gap')
  if (!hasGap) {
    emitStrayUnknowns(assigned, ctx, out)
  } else {
    checkUnorderedGap(assigned, specs, ctx, out)
  }
}

/** One `structure/section-order` per undeclared section, on a level with no gap that forbids them. */
function emitStrayUnknowns(assigned: Assigned[], ctx: Ctx, out: Finding[]): void {
  for (const a of assigned) {
    if (a.slotIdx === null) {
      out.push(
        ctx.finding({
          id: 'structure/section-order',
          message: `unexpected unknown section ‘${a.node.name}’; unknown sections are not permitted here`,
          pos: a.node.pos,
        }),
      )
    }
  }
}

/** Runs the block-kind, anchor and rule checks for each declared section that is present. */
function runPresentSlotChecks(
  assigned: Assigned[],
  slots: Slot[],
  ctx: Ctx,
  out: Finding[],
  levelHint: string | undefined,
): void {
  for (const a of assigned) {
    if (a.slotIdx === null) continue
    const slot = slots[a.slotIdx]!
    if (!slot.opts) continue
    runSectionChecks(a.node, slot.opts, ctx, out, levelHint)
  }
}

/** The first slot index for `name`, or `null` when none matches. */
function slotForOrNull(slots: Slot[], name: string): number | null {
  const i = slotForName(slots, name)
  return i === -1 ? null : i
}

/**
 * `recognized-relative`: declared sections keep their declared order. Undeclared sections may sit
 * anywhere. In document order, a declared section whose slot index is less than the largest index
 * seen so far is out of place.
 */
function checkRecognizedRelative(assigned: Assigned[], ctx: Ctx, out: Finding[]): void {
  let maxSlot = -1
  for (const a of assigned) {
    if (a.slotIdx === null) continue
    if (a.slotIdx < maxSlot) {
      out.push(
        ctx.finding({
          id: 'structure/section-order',
          message: `‘${a.node.name}’ appears after a later-declared section; recognized sections must keep declared order`,
          pos: a.node.pos,
        }),
      )
    } else {
      maxSlot = a.slotIdx
    }
  }
}

/**
 * `strict`: declared sections in declared order, with undeclared sections only at a `gap()`. It
 * walks the document sections and the specs together:
 *   - A section that matches the current slot fills it.
 *   - A section that matches a later slot while a required slot is still unfilled is out of
 *     order. It gets `structure/section-order` and fills the later slot.
 *   - An undeclared section at a gap is counted toward that gap. An undeclared section with no
 *     gap here and `allowUnknown: false` gets `structure/section-order`.
 * Then each gap's count is checked against its bounds.
 *
 * `admitPastSequence` handles sections after the last spec. `emitGapCounts` checks the gap
 * bounds.
 */
function checkStrict(
  nodes: SectionNode[],
  specs: readonly Spec[],
  slots: Slot[],
  allowUnknown: boolean,
  ctx: Ctx,
  out: Finding[],
): void {
  // The number of sections each gap has taken in: specIdx → count.
  const gapCount = new Map<number, number>()
  specs.forEach((s, i) => {
    if (unwrap(s).inner.kind === 'gap') gapCount.set(i, 0)
  })

  // How many sections the slot at `specIdx` has taken so far. A repeatable slot stays current
  // while matching sections follow, so its count can exceed one. Once filled, it acts like an
  // optional slot when a section for a later slot arrives.
  const slotFill = new Map<number, number>()

  /** The specIdx of the first slot at or after `fromSpecIdx` that names `name`, or `null`. */
  function matchesSlotFrom(name: string, fromSpecIdx: number): number | null {
    for (const slot of slots) {
      if (slot.specIdx >= fromSpecIdx && slot.names.includes(name)) return slot.specIdx
    }
    return null
  }

  let specIdx = 0
  let docIdx = 0
  while (docIdx < nodes.length) {
    const node = nodes[docIdx]!

    if (specIdx >= specs.length) {
      // Past the last spec: a trailing gap takes extras, else an undeclared section is reported.
      admitPastSequence(node, specs, slots, allowUnknown, gapCount, ctx, out)
      docIdx++
      continue
    }

    const spec = specs[specIdx]!
    const u = unwrap(spec)

    if (u.inner.kind === 'gap') {
      // A section that matches a later slot ends the gap. Check it again against the next spec.
      if (matchesSlotFrom(node.name, specIdx + 1) !== null) {
        specIdx++
        continue
      }
      // Otherwise the gap takes the section.
      gapCount.set(specIdx, (gapCount.get(specIdx) ?? 0) + 1)
      docIdx++
      continue
    }

    // The current spec is a `section` or `oneOf` slot.
    const slot = slots.find((s) => s.specIdx === specIdx)!
    if (slot.names.includes(node.name)) {
      slotFill.set(specIdx, (slotFill.get(specIdx) ?? 0) + 1)
      // A repeatable slot stays current for the next matching section. Any other slot is done.
      if (!slot.repeatable) specIdx++
      docIdx++
      continue
    }

    // A repeatable slot with at least one section is filled. Treat it as optional from here.
    // Its bounds are checked separately (repeat-count).
    const repeatSatisfied = slot.repeatable && (slotFill.get(specIdx) ?? 0) > 0

    // The section does not match the current slot. If it matches a later one, it came early.
    const later = matchesSlotFrom(node.name, specIdx + 1)
    if (later !== null) {
      if (!slot.optional && !repeatSatisfied) {
        out.push(
          ctx.finding({
            id: 'structure/section-order',
            message: `‘${node.name}’ appears before required section ‘${slot.names.join('’ / ‘')}’; strict order is violated`,
            pos: node.pos,
          }),
        )
      }
      // Move past the later slot, which this section fills.
      specIdx = later + 1
      docIdx++
      continue
    }

    // The current slot is optional or already filled: skip it and check the section again.
    if (slot.optional || repeatSatisfied) {
      specIdx++
      continue
    }

    // An undeclared section where a required slot is expected, with no gap here.
    if (slotForOrNull(slots, node.name) === null) {
      if (!allowUnknown) {
        out.push(
          ctx.finding({
            id: 'structure/section-order',
            message: `unexpected section ‘${node.name}’ in the strict prefix; extras are only permitted after a gap`,
            pos: node.pos,
          }),
        )
      }
      docIdx++
      continue
    }

    // A declared section whose slot came earlier (filled or skipped): move to the next spec.
    specIdx++
  }

  emitGapCounts(gapCount, specs, slots, nodes, ctx, out)
}

/**
 * Handles a section after the last spec. When the last spec is a gap, the gap takes it.
 * Otherwise an undeclared section is reported under `allowUnknown: false`. A declared section here
 * matches an earlier slot. Its order problem was already reported on the section that came early.
 */
function admitPastSequence(
  node: SectionNode,
  specs: readonly Spec[],
  slots: Slot[],
  allowUnknown: boolean,
  gapCount: Map<number, number>,
  ctx: Ctx,
  out: Finding[],
): void {
  const lastWasGap = specs.length > 0 && unwrap(specs[specs.length - 1]!).inner.kind === 'gap'
  const slotIdx = slotForOrNull(slots, node.name)
  if (slotIdx === null && !lastWasGap && !allowUnknown) {
    out.push(
      ctx.finding({
        id: 'structure/section-order',
        message: `unexpected section ‘${node.name}’ after the declared sequence`,
        pos: node.pos,
      }),
    )
  } else if (slotIdx === null && lastWasGap) {
    gapCount.set(specs.length - 1, (gapCount.get(specs.length - 1) ?? 0) + 1)
  }
}

/** Checks each gap's count against its `min` and `max` (`structure/gap-count`). */
function emitGapCounts(
  gapCount: Map<number, number>,
  specs: readonly Spec[],
  slots: Slot[],
  nodes: SectionNode[],
  ctx: Ctx,
  out: Finding[],
): void {
  for (const [gapSpecIdx, count] of gapCount) {
    const gap = unwrap(specs[gapSpecIdx]!).inner as GapSpec
    const min = gap.min
    const max = gap.max
    if ((min !== undefined && count < min) || (max !== undefined && count > max)) {
      out.push(
        ctx.finding({
          id: 'structure/gap-count',
          message:
            min !== undefined && count < min
              ? `gap admitted ${count} unknown sections; expected at least ${min}`
              : `gap admitted ${count} unknown sections; expected at most ${max}`,
          ...gapAnchorPos(specs, slots, nodes, gapSpecIdx),
        }),
      )
    }
  }
}

/**
 * Counts undeclared sections toward the first gap, on a level that is not `strict` and has
 * `allowUnknown: false`. Order does not matter there, so every undeclared section counts.
 */
function checkUnorderedGap(
  assigned: Assigned[],
  specs: readonly Spec[],
  ctx: Ctx,
  out: Finding[],
): void {
  const gapSpecIdx = specs.findIndex((s) => unwrap(s).inner.kind === 'gap')
  if (gapSpecIdx === -1) return
  const gap = unwrap(specs[gapSpecIdx]!).inner as GapSpec
  const count = assigned.filter((a) => a.slotIdx === null).length
  if ((gap.min !== undefined && count < gap.min) || (gap.max !== undefined && count > gap.max)) {
    out.push(
      ctx.finding({
        id: 'structure/gap-count',
        message:
          gap.min !== undefined && count < gap.min
            ? `gap admitted ${count} unknown sections; expected at least ${gap.min}`
            : `gap admitted ${count} unknown sections; expected at most ${gap.max}`,
      }),
    )
  }
}

/** The pos a gap-count finding carries: the first heading after the gap, else omitted. */
function gapAnchorPos(
  specs: readonly Spec[],
  slots: Slot[],
  nodes: SectionNode[],
  gapSpecIdx: number,
): { pos?: SectionNode['pos'] } {
  const after = slots.find((s) => s.specIdx > gapSpecIdx)
  if (!after) return {}
  const node = nodes.find((n) => after.names.includes(n.name))
  return node ? { pos: node.pos } : {}
}

// ── Per-section checks: block kind, anchors, rules, children ───────────

function runSectionChecks(
  node: SectionNode,
  opts: SectionOpts,
  ctx: Ctx,
  out: Finding[],
  levelHint?: string,
): void {
  // The section's own description, else the level's.
  const sectionHint = opts.description ?? levelHint
  const sctx = withHint(ctx, sectionHint)

  // A declared `^anchor` must be on a block or on the section.
  if (opts.anchor !== undefined) {
    if (!anchorResolves(node, opts.anchor)) {
      out.push(
        sctx.finding({
          id: 'structure/anchor-missing',
          message: `section ‘${node.name}’ is missing required block-id ^${opts.anchor}`,
          pos: node.pos,
        }),
      )
    }
  }

  // Block kind, for one leaf or for named leaves bound by `^anchor`. A leaf's own description
  // is the nearest hint for these findings.
  if (opts.content !== undefined) {
    if (isLeafSpec(opts.content)) {
      kindGate(
        node,
        opts.content,
        undefined,
        withHint(ctx, leafHintOf(opts.content, sectionHint)),
        out,
      )
    } else {
      for (const [anchor, leaf] of Object.entries(opts.content)) {
        kindGate(node, leaf, anchor, withHint(ctx, leafHintOf(leaf, sectionHint)), out)
      }
    }
  }

  // Section rules.
  if (opts.rules) {
    for (const r of opts.rules) {
      out.push(...r.run(node, sctx))
    }
  }

  if (opts.children) {
    matchLevel(node.sections, opts.children, ctx, out, sectionHint)
  }
}

/** A leaf's hint: the `description` in its options, else the section's hint. */
export function leafHintOf(leaf: LeafSpec, sectionHint: string | undefined): string | undefined {
  const desc = (leaf.config as { description?: unknown } | undefined)?.description
  return typeof desc === 'string' ? desc : sectionHint
}

/** True when this section or one of its blocks has the anchor `id`. */
function anchorResolves(node: SectionNode, id: string): boolean {
  if (node.anchors.includes(id)) return true
  return node.blocks.some((b) => b.anchor === id)
}

/** True for a single `LeafSpec`, false for a `Record<string, LeafSpec>`. */
function isLeafSpec(c: LeafSpec | Record<string, LeafSpec>): c is LeafSpec {
  return typeof (c as LeafSpec).kind === 'string'
}

/**
 * Checks that a leaf's block is present and of the right kind.
 *   - No block (or, for an anchored leaf, no block with that anchor): `structure/block-missing`.
 *   - A block (the anchored one, or the section's first) of the wrong kind:
 *     `structure/block-kind`.
 * The block's data (columns, rows, items) is checked by the content plane.
 */
function kindGate(
  node: SectionNode,
  leaf: LeafSpec,
  anchor: string | undefined,
  ctx: Ctx,
  out: Finding[],
): void {
  const expected: BlockKind = leaf.kind
  const candidate = pickBlock(node, anchor)
  if (!candidate) {
    out.push(
      ctx.finding({
        id: 'structure/block-missing',
        message: anchor
          ? `section ‘${node.name}’ is missing a ${expected} block at ^${anchor}`
          : `section ‘${node.name}’ is missing a ${expected} block`,
        pos: node.pos,
      }),
    )
    return
  }
  if (candidate.kind !== expected) {
    out.push(
      ctx.finding({
        id: 'structure/block-kind',
        message: `block in section ‘${node.name}’ is a ${candidate.kind}; expected a ${expected}`,
        pos: candidate.pos,
      }),
    )
  }
}

/**
 * The block a leaf checks: the block with `anchor` when it is set (or `null` if none), otherwise
 * the section's first block.
 */
function pickBlock(node: SectionNode, anchor: string | undefined): BlockNode | null {
  if (anchor !== undefined) {
    return node.blocks.find((b) => b.anchor === anchor) ?? null
  }
  return node.blocks[0] ?? null
}

// ── Entry points ─────────────────────────────────────────────────────────────────

/**
 * Matches the top-level sections against the body grammar and returns every `structure/*`
 * finding, in the order they were made. `validate()` sorts them. `rootHint` is the contract's
 * `description`, the last fallback for hints.
 */
export function matchStructure(
  tree: { root: SectionNode },
  body: SectionSeq,
  ctx: Ctx,
  rootHint?: string,
): Finding[] {
  const out: Finding[] = []
  matchLevel(tree.root.sections, body, ctx, out, rootHint)
  return out
}

/**
 * Reports `structure/heading-depth-jump` (warn) for a heading more than one level below its
 * parent section, such as an H4 right under an H2. `parse()` keeps the deeper heading's true
 * depth under its nearest parent and inserts nothing, so the jump shows as
 * `child.depth > parent.depth + 1`.
 *
 * It scans the whole tree, not the grammar, so it reports a skipped level whether or not the
 * contract declares those sections. The root's direct children are not checked. The root stands
 * for the H1 title and is not a real heading in the source.
 */
export function scanHeadingDepthJumps(root: SectionNode, ctx: Ctx): Finding[] {
  const out: Finding[] = []
  const walk = (parent: SectionNode, isRoot: boolean): void => {
    for (const child of parent.sections) {
      if (!isRoot && child.depth > parent.depth + 1) {
        out.push(
          ctx.finding({
            id: 'structure/heading-depth-jump',
            message: `heading ‘${child.name}’ (H${child.depth}) skips a level under ‘${parent.name}’ (H${parent.depth})`,
            pos: child.pos,
          }),
        )
      }
      walk(child, false)
    }
  }
  walk(root, true)
  return out
}
