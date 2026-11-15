import type { EcoEdge, EdgeKind, Ecosystem, OverlapKind, ViewMode } from './types'
import { inView } from './view'

/** Edge kinds grouped for the Relations filter. */
export type Relation = 'dependencies' | 'structure' | 'twins' | 'overlaps'
/**
 * The groups the filter offers. Twins are left out: a twin pair is one card, so its edge is never
 * drawn.
 */
export const RELATIONS: readonly Relation[] = ['dependencies', 'structure', 'overlaps']

export const RELATION_LABEL: Record<Relation, string> = {
  dependencies: 'Dependencies',
  structure: 'Structure',
  twins: 'Twins',
  overlaps: '≈ Overlaps',
}

const RELATION_OF: Record<EdgeKind, Relation> = {
  depends: 'dependencies',
  'dev-depends': 'dependencies',
  implements: 'structure',
  extends: 'structure',
  validates: 'structure',
  reads: 'structure',
  twin: 'twins',
  overlaps: 'overlaps',
}

/** An unknown kind counts as a dependency, the same default the parser uses. */
export function relationOf(kind: EdgeKind): Relation {
  return RELATION_OF[kind] ?? 'dependencies'
}

export function isOverlap(edge: Pick<EcoEdge, 'kind'>): boolean {
  return edge.kind === 'overlaps'
}

export const OVERLAP_KINDS: readonly OverlapKind[] = ['copy', 'partial']

/** The short tag drawn on an overlap edge and in the lists. */
export const OVERLAP_LABEL: Record<OverlapKind, string> = {
  copy: '≈ copy',
  partial: '≈ overlap',
}

export const OVERLAP_MEANING: Record<OverlapKind, string> = {
  copy: 'One is a copy or fork of the other.',
  partial: 'They solve part of the same problem in different code.',
}

export function overlapLabel(edge: EcoEdge): string {
  return OVERLAP_LABEL[edge.overlap ?? 'partial']
}

/** Edges per relation over the whole data, for the filter chips. */
export function relationCounts(eco: Ecosystem): { value: Relation; count: number }[] {
  return RELATIONS.map((value) => ({ value, count: eco.edges.filter((e) => relationOf(e.kind) === value).length }))
}

/** Overlap edges in a view. */
export function overlapsInView(eco: Ecosystem, view: ViewMode): EcoEdge[] {
  return eco.edges.filter((edge) => isOverlap(edge) && inView(edge.states, view))
}
