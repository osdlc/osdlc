/**
 * Builders for the parley blocks a screenshot-driven audit writes: figure,
 * steps, finding and the document around them, with regions placed from a
 * measured pixel box. Knows nothing about stories or Playwright; it returns
 * plain objects shaped by parley's `schema.json`, so a caller writes them with
 * `JSON.stringify`. Copying the image files into the document's `x/` folder is
 * the caller's job.
 */

/**
 * The size of an image in pixels.
 *
 * @experimental
 */
export interface Viewport {
  width: number
  height: number
}

/**
 * A box in pixels, from the image's top-left corner.
 *
 * @experimental
 */
export interface PixelBox {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A box as fractions of the image's width and height, 0 to 1.
 *
 * @experimental
 */
export interface FractionBox {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A marked area of an image, placed as fractions of it.
 *
 * @experimental
 */
export interface Region {
  id: string
  title: string
  box: FractionBox
  detail?: string
}

/**
 * One image of a `steps` block, with optional regions.
 *
 * @experimental
 */
export interface Frame {
  id: string
  src: string
  alt: string
  caption?: string
  detail?: string
  regions?: Region[]
}

/**
 * A `figure` block as parley reads it.
 *
 * @experimental
 */
export interface FigureBlock {
  id: string
  type: 'figure'
  title?: string
  src: string
  alt: string
  caption?: string
  detail?: string
  regions?: Region[]
}

/**
 * A `steps` block: a slide show of at least two frames.
 *
 * @experimental
 */
export interface StepsBlock {
  id: string
  type: 'steps'
  title?: string
  frames: Frame[]
}

/**
 * A `heading` block; `level` is 1, 2 or 3.
 *
 * @experimental
 */
export interface HeadingBlock {
  id: string
  type: 'heading'
  title: string
  level?: 1 | 2 | 3
}

/**
 * How much a finding matters: `blocker` must be fixed, `should` ought to be, `nice` is optional.
 *
 * @experimental
 */
export type Severity = 'blocker' | 'should' | 'nice'

/**
 * One evidence entry: an image (figure-like) or a frame sequence.
 *
 * @experimental
 */
export type Evidence =
  | { id: string; src: string; alt: string; caption?: string; regions?: Region[] }
  | { id: string; frames: Frame[] }

/**
 * A `finding` block as parley reads it.
 *
 * @experimental
 */
export interface FindingBlock {
  id: string
  type: 'finding'
  title?: string
  ref: string
  summary: string
  severity: Severity
  status: 'open' | 'fixed' | 'wontfix'
  area?: string
  problem?: string
  fix?: string
  refs?: string[]
  evidence?: Evidence[]
}

/**
 * Any block this module builds.
 *
 * @experimental
 */
export type Block = FigureBlock | StepsBlock | HeadingBlock | FindingBlock

/**
 * A parley document, ready for `JSON.stringify`.
 *
 * @experimental
 */
export interface ParleyDocument {
  id: string
  title: string
  summary?: string
  created: string
  keep?: boolean
  blocks: Block[]
}

/**
 * An id parley accepts (`^[a-z0-9][a-z0-9-]*$`): lower case, runs of other
 * characters become one dash, no leading or trailing dash. Empty input gives
 * `fallback`.
 *
 * @experimental
 */
export function slug(text: string, fallback = 'x'): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || fallback
}

/**
 * Hands out slugged ids that are unique among the ones it gave before: a clash
 * gets `-2`, `-3`, ... Parley wants block ids unique across the whole document.
 *
 * @experimental
 */
export function idAllocator(): (text: string, fallback?: string) => string {
  const used = new Set<string>()
  return (text, fallback) => {
    const base = slug(text, fallback)
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    return id
  }
}

const PRECISION = 10_000
const roundFraction = (n: number): number => Math.round(n * PRECISION) / PRECISION

/**
 * The region for `box` on an image of size `viewport`: the box clipped to the
 * image and written as fractions rounded to four places, so `x + w` and
 * `y + h` never pass 1. A box with no area inside the image (outside it,
 * empty, or not finite) has no region and returns `null`.
 *
 * @experimental
 */
export function regionFromBox(
  box: PixelBox,
  viewport: Viewport,
  meta: { id: string; title: string; detail?: string },
): Region | null {
  if (![box.x, box.y, box.w, box.h, viewport.width, viewport.height].every(Number.isFinite))
    return null
  if (viewport.width <= 0 || viewport.height <= 0) return null
  const left = Math.max(0, box.x)
  const top = Math.max(0, box.y)
  const right = Math.min(viewport.width, box.x + box.w)
  const bottom = Math.min(viewport.height, box.y + box.h)
  if (right <= left || bottom <= top) return null
  const x = Math.min(roundFraction(left / viewport.width), 1 - 1 / PRECISION)
  const y = Math.min(roundFraction(top / viewport.height), 1 - 1 / PRECISION)
  const w = Math.max(
    1 / PRECISION,
    Math.min(roundFraction((right - left) / viewport.width), roundFraction(1 - x)),
  )
  const h = Math.max(
    1 / PRECISION,
    Math.min(roundFraction((bottom - top) / viewport.height), roundFraction(1 - y)),
  )
  return {
    id: slug(meta.id),
    title: meta.title || meta.id,
    box: { x, y, w, h },
    ...(meta.detail ? { detail: meta.detail } : {}),
  }
}

/** Drops the `null`s `regionFromBox` returns, and the key when none are left. */
function regionsOf(regions: Array<Region | null> | undefined): { regions?: Region[] } {
  const kept = (regions ?? []).filter((r): r is Region => r !== null)
  return kept.length > 0 ? { regions: kept } : {}
}

/**
 * What {@link steps} takes for one frame; regions may be `null`, which are dropped.
 *
 * @experimental
 */
export interface FrameInput {
  id: string
  src: string
  alt: string
  caption?: string
  detail?: string
  regions?: Array<Region | null>
}

function frameOf(input: FrameInput): Frame {
  const { regions, id, ...rest } = input
  return { id: slug(id), ...rest, ...regionsOf(regions) }
}

/**
 * What {@link figure} takes; regions may be `null`, which are dropped.
 *
 * @experimental
 */
export interface FigureInput {
  id: string
  title?: string
  src: string
  alt: string
  caption?: string
  detail?: string
  regions?: Array<Region | null>
}

/**
 * A figure block: one image with optional regions marked on it. A `null` region is dropped.
 *
 * @experimental
 */
export function figure(input: FigureInput): FigureBlock {
  const { regions, id, ...rest } = input
  return { id: slug(id), type: 'figure', ...rest, ...regionsOf(regions) }
}

/**
 * What {@link steps} takes.
 *
 * @experimental
 */
export interface StepsInput {
  id: string
  title?: string
  frames: FrameInput[]
}

/**
 * A slide show; parley needs at least two frames, so fewer throws.
 *
 * @experimental
 */
export function steps(input: StepsInput): StepsBlock {
  if (input.frames.length < 2)
    throw new Error(`steps ${input.id} needs at least 2 frames, got ${input.frames.length}`)
  const frames = input.frames.map(frameOf)
  const ids = new Set(frames.map((f) => f.id))
  if (ids.size !== frames.length) throw new Error(`steps ${input.id} has duplicate frame ids`)
  return {
    id: slug(input.id),
    type: 'steps',
    ...(input.title ? { title: input.title } : {}),
    frames,
  }
}

/**
 * What {@link heading} takes.
 *
 * @experimental
 */
export interface HeadingInput {
  id: string
  title: string
  level?: 1 | 2 | 3
}

/**
 * A heading block that titles a section of the document.
 *
 * @experimental
 */
export function heading(input: HeadingInput): HeadingBlock {
  return {
    id: slug(input.id),
    type: 'heading',
    title: input.title,
    ...(input.level ? { level: input.level } : {}),
  }
}

/**
 * What a finding's `evidence` takes: one image, or at least two frames.
 *
 * @experimental
 */
export type EvidenceInput =
  | { id: string; src: string; alt: string; caption?: string; regions?: Array<Region | null> }
  | { id: string; frames: FrameInput[] }

function evidenceOf(input: EvidenceInput): Evidence {
  if ('frames' in input) {
    if (input.frames.length < 2)
      throw new Error(`evidence ${input.id} needs at least 2 frames; give src for one image`)
    return { id: slug(input.id), frames: input.frames.map(frameOf) }
  }
  const { regions, id, ...rest } = input
  return { id: slug(id), ...rest, ...regionsOf(regions) }
}

/**
 * What {@link finding} takes; `status` defaults to `open`.
 *
 * @experimental
 */
export interface FindingInput {
  id: string
  ref: string
  summary: string
  severity: Severity
  status?: 'open' | 'fixed' | 'wontfix'
  area?: string
  problem?: string
  fix?: string
  refs?: string[]
  evidence?: EvidenceInput[]
}

/**
 * A finding block: what was found, how severe it is, the fix, and its evidence. `status` defaults to `open`.
 *
 * @experimental
 */
export function finding(input: FindingInput): FindingBlock {
  const { id, evidence, status, ...rest } = input
  return {
    id: slug(id),
    type: 'finding',
    ...rest,
    status: status ?? 'open',
    ...(evidence && evidence.length > 0 ? { evidence: evidence.map(evidenceOf) } : {}),
  }
}

/**
 * What {@link parleyDocument} takes.
 *
 * @experimental
 */
export interface DocumentInput {
  id: string
  title: string
  summary?: string
  blocks: Block[]
  /** `YYYY-MM-DD`; today when omitted. */
  created?: string
  /** Show the reviewer Keep / Drop on each media item; `parley kept` then lists the kept files. */
  keep?: boolean
}

/**
 * The document around `blocks`, shaped as parley's `schema.json` asks: ids
 * slugged, `created` today when omitted. Throws on no blocks or a repeated
 * block id.
 *
 * @experimental
 */
export function parleyDocument(input: DocumentInput): ParleyDocument {
  if (input.blocks.length === 0) throw new Error('a parley document needs at least one block')
  const seen = new Set<string>()
  for (const block of input.blocks) {
    if (seen.has(block.id)) throw new Error(`duplicate block id ${block.id}`)
    seen.add(block.id)
  }
  return {
    id: slug(input.id),
    title: input.title,
    ...(input.summary ? { summary: input.summary } : {}),
    created: input.created ?? new Date().toISOString().slice(0, 10),
    ...(input.keep ? { keep: true } : {}),
    blocks: input.blocks,
  }
}
