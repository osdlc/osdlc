// Mirrors data/SCHEMA.md. Change both together.

export type State = 'present' | 'target'
export const STATES: readonly State[] = ['present', 'target']

export type NodeKind = 'package' | 'crate' | 'spec' | 'profile' | 'corpus' | 'tool' | 'app' | 'workflow'
export type Language = 'ts' | 'rust' | 'yaml' | 'markdown' | 'none'
export type NodeStatus = 'published' | 'unpublished' | 'in-progress' | 'planned' | 'retiring' | 'proposal'
export type EdgeKind =
  | 'depends'
  | 'dev-depends'
  | 'twin'
  | 'implements'
  | 'extends'
  | 'validates'
  | 'reads'
  | 'overlaps'

/** On an `overlaps` edge: `copy` when one is a copy or fork of the other, `partial` when different code solves part of the same problem. */
export type OverlapKind = 'copy' | 'partial'

export type PerState<T> = Record<State, T | null>

export interface Layer {
  id: string
  label: string
  summary: string
}

export interface Repo {
  id: string
  label: string
  url: string
}

export interface Link {
  label: string
  url: string
}

export interface EcoNode {
  id: string
  name: string
  kind: NodeKind
  language: Language
  layer: string
  states: State[]
  repo: PerState<string>
  path: PerState<string>
  status: NodeStatus
  version: string | null
  registry: string | null
  twin: string | null
  purpose: string
  notes: string[]
  tasks: number[]
  links: Link[]
}

export interface EcoEdge {
  from: string
  to: string
  kind: EdgeKind
  states: State[]
  note?: string
  /** Set on `overlaps` edges only. */
  overlap?: OverlapKind
}

export interface Ecosystem {
  asOf: string
  sources: string[]
  layers: Layer[]
  repos: Repo[]
  nodes: EcoNode[]
  edges: EcoEdge[]
}

/** The view switch: one state, or both side by side. */
export type ViewMode = State | 'compare'

/** Where an element sits across the two states. */
export type Change = 'both' | 'removed' | 'added'

export function edgeId(edge: Pick<EcoEdge, 'from' | 'to' | 'kind'>): string {
  return `${edge.from}->${edge.to}:${edge.kind}`
}
