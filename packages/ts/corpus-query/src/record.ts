/** One record: its data, what it refers to, what refers to it, and the records a few hops away. */
import type { CorpusRecord, LoadedCorpus, RecordTarget } from '@osdlc/corpus-schema'

import {
  headerOf,
  headerOfTarget,
  QueryError,
  type RecordHeader,
  type RecordRef,
  recordOfTarget,
  resolveRef,
  stringList,
} from './model.ts'

/**
 * `reference` for a value of an `x-ref` field, `link` for a link in the Markdown body.
 *
 * @experimental
 */
export type ReferenceVia = 'reference' | 'link'

/**
 * A value of a reference field, or a link in the body, with the record it points at.
 *
 * @experimental
 */
export interface OutgoingReference {
  /** See {@link ReferenceVia}. */
  via: ReferenceVia
  /** The field that holds the value. Null for a body link. */
  field: string | null
  /** The value's place in the record's data, as a JSON Pointer. Null for a body link. */
  pointer: string | null
  /** The value as the record holds it, or the link's path as written. */
  value: unknown
  /** The record it points at, or null when it names none. */
  target: RecordHeader | null
  /** Why it names no record, or null. */
  unresolved: string | null
}

/**
 * A reference or a body link that points at a record, with the record that holds it.
 *
 * @experimental
 */
export interface IncomingReference {
  /** See {@link ReferenceVia}. */
  via: ReferenceVia
  /** The field of the holding record. Null for a body link. */
  field: string | null
  /** The value's place in the holding record's data, as a JSON Pointer. Null for a body link. */
  pointer: string | null
  /** The record that holds the reference or the link. */
  from: RecordHeader
}

/**
 * One record in full.
 *
 * @experimental
 */
export interface RecordDetail extends RecordHeader {
  /** The record's identity, a package URL, or null when its corpus is in no package. */
  identity: string | null
  /** The file's format. */
  format: 'md' | 'yaml' | 'json'
  /** Whether the record passes its type's schema and its id is the only one in its type. */
  valid: boolean
  /** The record folder's other files, relative to the corpus root. */
  files: string[]
  /** The frontmatter of a `.md` record, or the whole of a `.yaml` or `.json` one. */
  data: Record<string, unknown>
  /** The Markdown body. Absent with `body: false`; null for a `.yaml` or `.json` record. */
  body?: string | null
  /** Absent with `references: false`. */
  references?: OutgoingReference[]
  /** Absent with `backlinks: false`. */
  backlinks?: IncomingReference[]
}

/**
 * What `readRecord` leaves out. Each is true by default.
 *
 * @experimental
 */
export interface ReadOptions {
  /** false leaves the Markdown body out. */
  body?: boolean
  /** false leaves `references` out. */
  references?: boolean
  /** false leaves `backlinks` out. */
  backlinks?: boolean
}

/**
 * How `traverse` walks.
 *
 * @experimental
 */
export interface TraverseOptions {
  /** `out` follows the record's references, `in` follows what refers to it. Default `out`. */
  direction?: 'out' | 'in'
  /** The reference field or fields to follow. Default: every one. A string may join them with commas. */
  via?: string | string[]
  /** Whether to follow links in Markdown bodies too. Default false. */
  links?: boolean
  /** How many hops to go. Default 1, at most 10. */
  depth?: number
  /** How many records to return at most. Default 200, at most 5000. */
  limit?: number
}

/**
 * What `traverse` returns: the records reached, nearest first, and the edges between them.
 *
 * @experimental
 */
export interface TraverseResult {
  /** The record the walk starts from. */
  root: RecordHeader
  /** Each record reached, once, with the fewest hops that reach it. */
  nodes: (RecordHeader & { depth: number })[]
  /** Each reference followed, `from` the record that holds it `to` the record it names, by `ref`. */
  edges: { from: string; to: string; via: ReferenceVia; field: string | null }[]
  /** Whether `limit` stopped the walk before `depth` did. */
  truncated: boolean
}

/** The field a JSON Pointer's first step names: `/sources/2` is `sources`. */
const fieldOf = (pointer: string | null): string | null =>
  pointer === null ? null : (pointer.split('/')[1] ?? '').replace(/~1/g, '/').replace(/~0/g, '~')

function outgoing(model: LoadedCorpus, record: CorpusRecord): OutgoingReference[] {
  return [
    ...record.references.map((r): OutgoingReference => ({
      via: 'reference',
      field: r.field,
      pointer: r.pointer,
      value: r.value,
      target: r.target === null ? null : headerOfTarget(model, r.target),
      unresolved: r.unresolved,
    })),
    ...record.links.map((l): OutgoingReference => ({
      via: 'link',
      field: null,
      pointer: null,
      value: l.href,
      target: headerOfTarget(model, l.target),
      unresolved: null,
    })),
  ]
}

const incoming = (model: LoadedCorpus, record: CorpusRecord): IncomingReference[] =>
  record.incoming.map((b) => ({
    via: b.via,
    field: fieldOf(b.pointer),
    pointer: b.pointer,
    from: headerOfTarget(model, b.from),
  }))

/**
 * One record by name: its data and body, each reference and body link with the record it points
 * at, and each record that points at it.
 *
 * @throws QueryError `not-found`, `ambiguous`, `unknown-type` or `unknown-corpus`.
 * @experimental
 */
export function readRecord(
  model: LoadedCorpus,
  ref: RecordRef,
  options: ReadOptions = {},
): RecordDetail {
  const { key, record } = resolveRef(model, ref)
  return {
    ...headerOf(key, record),
    identity: record.identity,
    format: record.format,
    valid: record.valid,
    files: record.files,
    data: record.data,
    ...(options.body === false ? {} : { body: record.body }),
    ...(options.references === false ? {} : { references: outgoing(model, record) }),
    ...(options.backlinks === false ? {} : { backlinks: incoming(model, record) }),
  }
}

/**
 * What a record refers to: each value of its reference fields, then each link in its body.
 *
 * @throws QueryError as `readRecord`.
 * @experimental
 */
export const getReferences = (model: LoadedCorpus, ref: RecordRef): OutgoingReference[] =>
  outgoing(model, resolveRef(model, ref).record)

/**
 * What refers to a record: each reference and body link in the loaded graph that points at it.
 *
 * @throws QueryError as `readRecord`.
 * @experimental
 */
export const getBacklinks = (model: LoadedCorpus, ref: RecordRef): IncomingReference[] =>
  incoming(model, resolveRef(model, ref).record)

function whole(name: string, value: number | undefined, otherwise: number, most: number): number {
  if (value === undefined) return otherwise
  if (!Number.isInteger(value) || value < 1 || value > most)
    throw new QueryError(
      'bad-query',
      `${name}: expected a whole number from 1 to ${most}, got ${JSON.stringify(value)}`,
    )
  return value
}

/**
 * The records within `depth` hops of a record, following its references (`out`) or what refers
 * to it (`in`), breadth first. `via` keeps the walk to some reference fields.
 *
 * @throws QueryError as `readRecord`, and `bad-query` for a `depth` or `limit` out of range.
 * @experimental
 */
export function traverse(
  model: LoadedCorpus,
  ref: RecordRef,
  options: TraverseOptions = {},
): TraverseResult {
  const depth = whole('depth', options.depth, 1, 10)
  const limit = whole('limit', options.limit, 200, 5000)
  if (options.direction !== undefined && options.direction !== 'out' && options.direction !== 'in')
    throw new QueryError('bad-query', `direction: expected 'out' or 'in'`)
  const inward = options.direction === 'in'
  const via =
    options.via === undefined
      ? undefined
      : new Set(
          (stringList('via', options.via) ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()),
        )
  const start = resolveRef(model, ref)
  const root = headerOf(start.key, start.record)
  const result: TraverseResult = { root, nodes: [], edges: [], truncated: false }
  const seen = new Set<string>([root.ref])
  const drawn = new Set<string>()
  let frontier: { header: RecordHeader; record: CorpusRecord }[] = [
    { header: root, record: start.record },
  ]
  for (let hop = 1; hop <= depth && frontier.length > 0; hop++) {
    const next: typeof frontier = []
    for (const { header, record } of frontier) {
      const steps: { other: RecordTarget; via: ReferenceVia; field: string | null }[] = inward
        ? record.incoming.map((b) => ({ other: b.from, via: b.via, field: fieldOf(b.pointer) }))
        : [
            ...record.references.flatMap((r) =>
              r.target === null
                ? []
                : [{ other: r.target, via: 'reference' as const, field: r.field }],
            ),
            ...record.links.map((l) => ({ other: l.target, via: 'link' as const, field: null })),
          ]
      for (const step of steps) {
        if (
          step.via === 'link'
            ? options.links !== true
            : via !== undefined && !via.has(step.field ?? '')
        )
          continue
        const other = headerOfTarget(model, step.other)
        if (!seen.has(other.ref)) {
          if (result.nodes.length >= limit) {
            result.truncated = true
            continue
          }
          seen.add(other.ref)
          result.nodes.push({ ...other, depth: hop })
          const reached = recordOfTarget(model, step.other)
          if (reached !== undefined) next.push({ header: other, record: reached })
        }
        const [from, to] = inward ? [other.ref, header.ref] : [header.ref, other.ref]
        const edge = JSON.stringify([from, to, step.field])
        if (!drawn.has(edge)) {
          drawn.add(edge)
          result.edges.push({ from, to, via: step.via, field: step.field })
        }
      }
    }
    frontier = next
  }
  return result
}
