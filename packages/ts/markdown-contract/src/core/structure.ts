/**
 * The structure plane — the tree-grammar matcher.
 *
 * `matchStructure(tree, body, ctx)` walks the projection's section tree against a level's
 * ordered `Spec[]`, recursing through `children`, and emits the `structure/*` findings:
 *
 *   - section presence       — `structure/section-missing`
 *   - ordering               — `structure/section-order` (order × allowUnknown × gap)
 *   - gap windows            — `structure/gap-count`
 *   - duplicates / aliases   — `structure/duplicate-section`
 *   - camelCase collisions   — `structure/key-collision`
 *   - the block kind-gate    — `structure/block-missing`, `structure/block-kind`
 *   - anchors                — `structure/anchor-missing`
 *   - node-local rules       — `rule(...)` carriers run here
 *
 * Kind and presence are structure; data shape is content. This plane reads
 * `LeafSpec.kind` only — it never builds or runs the content Zod schema.
 *
 * Hints: the walk threads the nearest enclosing authored `description` — each level
 * computes its effective hint (`opts.description ?? inherited`) and passes it down; slot-bound
 * findings prefer the slot's own description. Findings mint through a `withHint`-wrapped `Ctx`,
 * so a description-free contract stays byte-identical (no `hint` key).
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

// ── Spec inspection helpers ──────────────────────────────────────────────────────

/** A declared section/oneOf slot, after `optional(...)` is unwrapped. */
interface Slot {
  /** index into the level's `specs` array (the gap-bearing one) */
  specIdx: number
  /** the admissible heading spellings (alias set for oneOf / `section([...])`) */
  names: string[]
  optional: boolean
  /** repeatable slot — its heading may recur as peers; occurrences fill this one slot */
  repeatable: boolean
  /** minimum occurrence count for a repeatable slot, if declared */
  min?: number
  /** maximum occurrence count for a repeatable slot, if declared */
  max?: number
  /** the section opts (content / children / rules / anchor), if any */
  opts?: SectionOpts | undefined
}

/** Unwrap `optional(spec)` to its inner spec, tracking optionality. */
function unwrap(spec: Spec): { inner: SectionSpec | OneOfSpec | GapSpec; optional: boolean } {
  if (spec.kind === 'optional') {
    const u = unwrap((spec as OptionalSpec).spec)
    return { inner: u.inner, optional: true }
  }
  return { inner: spec, optional: false }
}

/** Build a slot from a section/oneOf's shared shape — names, optionality, and the repeatable bounds. */
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

/** Project the declared `Spec[]` into the ordered list of section/oneOf slots (gaps excluded). */
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

/** The index of the first slot whose name set contains `name`, or -1 (unknown). */
function slotForName(slots: Slot[], name: string): number {
  return slots.findIndex((s) => s.names.includes(name))
}

/** Whether `name` matches a declared REPEATABLE slot — its peers are admitted, not errors. */
function isRepeatableName(slots: Slot[], name: string): boolean {
  return slots.some((s) => s.repeatable && s.names.includes(name))
}

// ── The per-level match ──────────────────────────────────────────────────────────

/** A doc section paired with the declared slot it matches (or `null` when unknown). */
interface Assigned {
  node: SectionNode
  /** index into `slots`, or `null` when the section matches no declared slot */
  slotIdx: number | null
}

/**
 * Duplicate-heading and camelCase key-collision detection at one level. A heading
 * matching a declared REPEATABLE slot is exempt — its peers are the collection the slot admits,
 * so neither `structure/duplicate-section` (exact repeat) nor `structure/key-collision` fires for
 * it. Every other heading keeps today's per-level-uniqueness rule.
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
      continue // a duplicate cannot also collide a new key
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
 * Repeatable-slot occurrence bounds (min / max) → `structure/repeat-count`. A present
 * repeatable slot outside its declared bounds is an error: `max` bites at the first surplus
 * occurrence; `min` bites only once the slot is present (count 0 for a required slot is
 * `structure/section-missing`, its absence — not its count).
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

/** Emit `structure/repeat-count` for one repeatable slot whose occurrence count falls outside its
 *  declared `min` / `max`. `max` bites at the first surplus occurrence; `min` bites once present. */
function emitRepeatBound(slot: Slot, nodes: SectionNode[], ctx: Ctx, out: Finding[]): void {
  const matches = nodes.filter((n) => slot.names.includes(n.name))
  const count = matches.length
  const label = slot.names.join('’ / ‘')
  if (slot.max !== undefined && count > slot.max) {
    const offender = matches[slot.max] // the first occurrence past the bound
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
 * Match one level: `nodes` (the sibling sections at this depth) against `specs` under
 * `opts`. Emits findings into `out`, then recurses into declared sections' `children`.
 * `inheritedHint` is the nearest enclosing description above this level; the
 * level's own `opts.description` (if any) supersedes it for everything minted below.
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

  // Assign each section to its declared slot (first occurrence binds the slot).
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

/** oneOf / alias ambiguity: a second distinct spelling filling an already-filled multi-name slot. */
function checkAliasAmbiguity(assigned: Assigned[], slots: Slot[], ctx: Ctx, out: Finding[]): void {
  const slotBoundBy = new Map<number, string>() // slotIdx → the heading that first filled it
  for (const a of assigned) {
    if (a.slotIdx === null) continue
    const slot = slots[a.slotIdx]!
    if (slot.repeatable) continue // a repeatable slot admits every spelling of its peers
    if (slot.names.length <= 1) continue // single-spelling slot: handled by duplicate-section above
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

/** Required (non-optional) declared slots that no doc section filled → `structure/section-missing`. */
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
    // Absence localizes to the document: pin pos to the first body heading when one exists,
    // else omit (an empty body has no line to point at). The fixtures pin line 1 / omit.
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
 * Ordering + unknown-admission. `recognized-relative` / `strict` run their order check; then, for a
 * non-strict level with `allowUnknown: false`, each unknown is out of place unless a gap admits it
 * (a gap on an unordered level counts all unknowns against that single window). `order === "none"`
 * with `allowUnknown: true` admits everything.
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

  // Unknowns are only legal at a gap; with no gap declared, each unknown is out of place.
  const hasGap = specs.some((s) => unwrap(s).inner.kind === 'gap')
  if (!hasGap) {
    emitStrayUnknowns(assigned, ctx, out)
  } else {
    // A gap exists but the level is unordered — count all unknowns against the (single) gap.
    checkUnorderedGap(assigned, specs, ctx, out)
  }
}

/** One `structure/section-order` per unknown section on a gap-less, unknown-forbidding level. */
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

/** The kind-gate, anchors, and node-local rules for each declared, present slot. */
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

/** First slot index for `name`, or `null` when unknown. */
function slotForOrNull(slots: Slot[], name: string): number | null {
  const i = slotForName(slots, name)
  return i === -1 ? null : i
}

/**
 * recognized-relative: recognized sections must keep declared relative order; unknowns
 * interleave freely. Scanning recognized sections in document order, a section whose
 * declared index is *less* than the largest index already seen is the out-of-place one.
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
 * strict: recognized sections in declared order, contiguous; unknowns admitted only at a
 * `gap()` window. A positional walk over doc sections and declared specs:
 *   - a section matching the current slot consumes it;
 *   - a section matching a *later* slot while a required slot is pending has jumped ahead
 *     → `structure/section-order` at the jumper, then it consumes the later slot;
 *   - an unknown at a gap is admitted (counted for the gap bound); an unknown with no gap
 *     here and `allowUnknown: false` → `structure/section-order`.
 * Gap bounds are checked against each window's admitted count.
 *
 * The separable passes (past-sequence admission, gap-count bounds) are extracted to
 * `admitPastSequence` / `emitGapCounts`; what remains is the irreducible two-cursor merge.
 */
function checkStrict(
  nodes: SectionNode[],
  specs: readonly Spec[],
  slots: Slot[],
  allowUnknown: boolean,
  ctx: Ctx,
  out: Finding[],
): void {
  // Per-spec gap windows: specIdx → { min, max, count, anchorPos }.
  const gapCount = new Map<number, number>()
  specs.forEach((s, i) => {
    if (unwrap(s).inner.kind === 'gap') gapCount.set(i, 0)
  })

  // How many document sections a slot at `specIdx` has consumed so far. A repeatable slot
  // stays on the cursor to absorb consecutive matching peers, so its fill count can exceed one; a
  // filled repeatable slot behaves like a satisfied (optional) one when a later slot arrives.
  const slotFill = new Map<number, number>()

  /** Does `name` match a section/oneOf slot whose specIdx is ≥ `fromSpecIdx`? */
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
      // Past the declared sequence — a trailing gap absorbs extras, else an unknown is out of place.
      admitPastSequence(node, specs, slots, allowUnknown, gapCount, ctx, out)
      docIdx++
      continue
    }

    const spec = specs[specIdx]!
    const u = unwrap(spec)

    if (u.inner.kind === 'gap') {
      // Does this section anchor a later slot? Then close the gap and re-evaluate the section.
      if (matchesSlotFrom(node.name, specIdx + 1) !== null) {
        specIdx++
        continue
      }
      // Otherwise admit the unknown into the gap window.
      gapCount.set(specIdx, (gapCount.get(specIdx) ?? 0) + 1)
      docIdx++
      continue
    }

    // A section/oneOf slot at the cursor.
    const slot = slots.find((s) => s.specIdx === specIdx)!
    if (slot.names.includes(node.name)) {
      slotFill.set(specIdx, (slotFill.get(specIdx) ?? 0) + 1)
      // A repeatable slot stays on the cursor to consume consecutive matching peers;
      // a normal slot advances past it after a single match.
      if (!slot.repeatable) specIdx++
      docIdx++
      continue
    }

    // A repeatable slot that has already consumed ≥1 peer is satisfied — treat it like an
    // optional slot as the walk moves on (its bounds are checked separately as repeat-count).
    const repeatSatisfied = slot.repeatable && (slotFill.get(specIdx) ?? 0) > 0

    // Doesn't match the cursor slot. If it matches a later slot, it jumped ahead of this one.
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
      // Advance the cursor to the later slot and consume the section there.
      specIdx = later + 1
      docIdx++
      continue
    }

    // The cursor slot is optional (or a satisfied repeatable) and unmatched → skip it, retry section.
    if (slot.optional || repeatSatisfied) {
      specIdx++
      continue
    }

    // An unknown section sitting on a required slot with no gap here.
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

    // A recognized section whose slot is earlier (already consumed/skipped): advance the cursor.
    specIdx++
  }

  emitGapCounts(gapCount, specs, slots, nodes, ctx, out)
}

/**
 * A doc section encountered past the declared spec sequence. A trailing gap (if the last spec was
 * one) absorbs it into that window; otherwise an unknown is out of place under `allowUnknown: false`.
 * A recognized section here matched an earlier (skipped) slot — its disorder was already flagged at
 * the jumper.
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

/** Check each gap window's admitted count against its `min` / `max` bound → `structure/gap-count`. */
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
 * Count unknowns against a single gap on an *unordered* level with `allowUnknown: false`.
 * (Order is unconstrained, so every unknown counts toward the lone gap window.)
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
  // The slot immediately following the gap, if any, anchors the window.
  const after = slots.find((s) => s.specIdx > gapSpecIdx)
  if (!after) return {}
  const node = nodes.find((n) => after.names.includes(n.name))
  return node ? { pos: node.pos } : {}
}

// ── Per-section checks: kind-gate, anchors, node-local rules, recursion ───────────

function runSectionChecks(
  node: SectionNode,
  opts: SectionOpts,
  ctx: Ctx,
  out: Finding[],
  levelHint?: string,
): void {
  // The section's effective hint — its own description, else the enclosing level's.
  const sectionHint = opts.description ?? levelHint
  const sctx = withHint(ctx, sectionHint)

  // Anchor presence — a declared `^anchor` must resolve to a block or section anchor.
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

  // The content kind-gate — a single leaf, or named leaves bound by `^anchor`. A leaf's own
  // config description (v2) is the nearest hint for its kind-gate findings.
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

  // Node-local rules.
  if (opts.rules) {
    for (const r of opts.rules) {
      out.push(...r.run(node, sctx))
    }
  }

  // Recurse into declared children.
  if (opts.children) {
    matchLevel(node.sections, opts.children, ctx, out, sectionHint)
  }
}

/** A leaf's effective hint: its config's authored `description` (v2), else the section's. */
export function leafHintOf(leaf: LeafSpec, sectionHint: string | undefined): string | undefined {
  const desc = (leaf.config as { description?: unknown } | undefined)?.description
  return typeof desc === 'string' ? desc : sectionHint
}

/** Whether an anchor id resolves to a block-bound or section-level anchor in this section. */
function anchorResolves(node: SectionNode, id: string): boolean {
  if (node.anchors.includes(id)) return true
  return node.blocks.some((b) => b.anchor === id)
}

/** Structural type-guard: a single `LeafSpec` vs a `Record<string, LeafSpec>`. */
function isLeafSpec(c: LeafSpec | Record<string, LeafSpec>): c is LeafSpec {
  return typeof (c as LeafSpec).kind === 'string'
}

/**
 * The kind-gate: a declared content slot must be filled by a block of the expected kind.
 *   - no block of any kind present (or, for an anchored leaf, no block at that anchor) →
 *     `structure/block-missing`;
 *   - a block present (at the anchor, or the section's lone block) but the wrong kind →
 *     `structure/block-kind`.
 * Data shape (columns / rows / items) is NOT checked here — that is the content plane.
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
 * The block a content slot addresses: when `anchor` is set, the block carrying that anchor
 * (or `null` if none); otherwise the section's first block of the expected role, here the
 * first block (a single-leaf slot addresses the section's sole content block).
 */
function pickBlock(node: SectionNode, anchor: string | undefined): BlockNode | null {
  if (anchor !== undefined) {
    return node.blocks.find((b) => b.anchor === anchor) ?? null
  }
  return node.blocks[0] ?? null
}

// ── Public entry ─────────────────────────────────────────────────────────────────

/**
 * Walk the projection's top-level sections against the body grammar, emitting every
 * `structure/*` finding. The result is returned in emission order; `validate()` applies
 * the deterministic sort. `rootHint` is the
 * contract-root `description` — the outermost hint fallback for the walk.
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
 * Emit `structure/heading-depth-jump` (warn) for a sub-heading nested more than one level
 * below its parent section — an H2 immediately followed by an H4. The
 * projection attaches the deeper heading to its nearest ancestor with its TRUE depth preserved
 * (no synthesized intermediate), so the jump is re-derivable here as `child.depth > parent.depth + 1`.
 *
 * Contract-independent: it scans the whole projected tree, not the grammar, so a malformed
 * outline is flagged whether or not a contract declares those sections. The synthetic root's
 * direct children (the top-level H2s) are not checked against it — "H1-title → H2" is the normal
 * step, and the root's depth is a projection artifact, not an authored heading.
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
