import type { EcoEdge, EcoNode, Ecosystem, PerState, State } from './types'
import { STATES } from './types'

export type DataSource = 'ecosystem.json' | 'fixture.json'

export interface LoadedData {
  source: DataSource
  eco: Ecosystem
  /** Rule breaks from data/SCHEMA.md. The app still draws what it can. */
  problems: string[]
}

/**
 * Picks `ecosystem.json` when it is present, else the fixture. `modules` maps file paths to parsed
 * JSON, as `import.meta.glob` returns them.
 */
export function pickDataset(modules: Record<string, unknown>): { source: DataSource; raw: unknown } {
  const entries = Object.entries(modules)
  const real = entries.find(([path]) => path.endsWith('/ecosystem.json'))
  if (real) return { source: 'ecosystem.json', raw: real[1] }
  const fixture = entries.find(([path]) => path.endsWith('/fixture.json'))
  if (fixture) return { source: 'fixture.json', raw: fixture[1] }
  throw new Error('Neither data/ecosystem.json nor data/fixture.json was found.')
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function array<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function states(value: unknown): State[] {
  return array(value).filter((s): s is State => s === 'present' || s === 'target')
}

function perState(value: unknown): PerState<string> {
  const source = isObject(value) ? value : {}
  return {
    present: typeof source.present === 'string' ? source.present : null,
    target: typeof source.target === 'string' ? source.target : null,
  }
}

function toNode(raw: Json): EcoNode {
  return {
    id: text(raw.id),
    name: text(raw.name, text(raw.id)),
    kind: text(raw.kind, 'package') as EcoNode['kind'],
    language: text(raw.language, 'none') as EcoNode['language'],
    layer: text(raw.layer),
    states: states(raw.states),
    repo: perState(raw.repo),
    path: perState(raw.path),
    status: text(raw.status, 'unpublished') as EcoNode['status'],
    version: typeof raw.version === 'string' ? raw.version : null,
    registry: typeof raw.registry === 'string' ? raw.registry : null,
    twin: typeof raw.twin === 'string' ? raw.twin : null,
    purpose: text(raw.purpose),
    notes: array(raw.notes).filter((n): n is string => typeof n === 'string'),
    tasks: array(raw.tasks).filter((t): t is number => typeof t === 'number'),
    links: array(raw.links)
      .filter(isObject)
      .map((link) => ({ label: text(link.label, text(link.url)), url: text(link.url) })),
  }
}

function toEdge(raw: Json): EcoEdge {
  const edge: EcoEdge = {
    from: text(raw.from),
    to: text(raw.to),
    kind: text(raw.kind, 'depends') as EcoEdge['kind'],
    states: states(raw.states),
  }
  if (typeof raw.note === 'string') edge.note = raw.note
  if (raw.overlap === 'copy' || raw.overlap === 'partial') edge.overlap = raw.overlap
  return edge
}

/** The SCHEMA.md rules for one `overlaps` edge. `seen` collects node pairs, in either order. */
function overlapProblems(edge: EcoEdge, from: EcoNode, seen: Set<string>): string[] {
  const at = `Overlap edge ${edge.from} -- ${edge.to}`
  const problems: string[] = []
  if (edge.overlap === undefined) problems.push(`${at} needs overlap: copy or partial.`)
  if (edge.note === undefined || edge.note.trim() === '') problems.push(`${at} needs a note saying what overlaps.`)
  if (from.twin === edge.to) problems.push(`${at} joins twins; twins have their own edge.`)
  if (edge.from === edge.to) problems.push(`${at} joins a node to itself.`)
  const pair = [edge.from, edge.to].sort().join('|')
  if (seen.has(pair)) problems.push(`${at} is listed twice.`)
  seen.add(pair)
  return problems
}

/** Reads the JSON leniently, fills defaults, and lists every rule from SCHEMA.md it breaks. */
export function parseEcosystem(raw: unknown): { eco: Ecosystem; problems: string[] } {
  if (!isObject(raw)) throw new Error('The data file is not a JSON object.')
  const problems: string[] = []

  const nodes = array(raw.nodes).filter(isObject).map(toNode)
  const byId = new Map<string, EcoNode>()
  for (const node of nodes) {
    if (byId.has(node.id)) problems.push(`Node id "${node.id}" is used twice; the first one is kept.`)
    else byId.set(node.id, node)
  }

  const eco: Ecosystem = {
    asOf: text(raw.asOf),
    sources: array(raw.sources).filter((s): s is string => typeof s === 'string'),
    layers: array(raw.layers)
      .filter(isObject)
      .map((layer) => ({ id: text(layer.id), label: text(layer.label, text(layer.id)), summary: text(layer.summary) })),
    repos: array(raw.repos)
      .filter(isObject)
      .map((repo) => ({ id: text(repo.id), label: text(repo.label, text(repo.id)), url: text(repo.url) })),
    nodes: [...byId.values()],
    edges: [],
  }

  const layerIds = new Set(eco.layers.map((layer) => layer.id))
  for (const node of eco.nodes) {
    if (node.states.length === 0) problems.push(`Node "${node.id}" has no states.`)
    if (!layerIds.has(node.layer)) problems.push(`Node "${node.id}" names unknown layer "${node.layer}".`)
    for (const state of STATES) {
      const absent = !node.states.includes(state)
      if (absent && (node.repo[state] !== null || node.path[state] !== null)) {
        problems.push(`Node "${node.id}" is absent from ${state} but has a ${state} repo or path.`)
      }
    }
    if (node.twin !== null) {
      const twin = byId.get(node.twin)
      if (!twin) problems.push(`Node "${node.id}" names unknown twin "${node.twin}".`)
      else if (twin.twin !== node.id) problems.push(`Twins "${node.id}" and "${node.twin}" do not name each other.`)
    }
  }

  const seenOverlaps = new Set<string>()
  for (const edge of array(raw.edges).filter(isObject).map(toEdge)) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) {
      problems.push(`Edge ${edge.from} -> ${edge.to} names a node that does not exist; it is skipped.`)
      continue
    }
    const outside = edge.states.filter((s) => !from.states.includes(s) || !to.states.includes(s))
    if (outside.length > 0) {
      problems.push(`Edge ${edge.from} -> ${edge.to} is in ${outside.join(', ')}, where one of its nodes is absent.`)
    }
    if (edge.kind === 'twin' && (from.language !== 'rust' || to.language !== 'ts')) {
      problems.push(`Twin edge ${edge.from} -> ${edge.to} should run from the Rust crate to the TypeScript package.`)
    }
    if (edge.kind === 'overlaps') problems.push(...overlapProblems(edge, from, seenOverlaps))
    else if (edge.overlap !== undefined) problems.push(`Edge ${edge.from} -> ${edge.to} has overlap but is not an overlaps edge.`)
    eco.edges.push(edge)
  }

  return { eco, problems }
}
