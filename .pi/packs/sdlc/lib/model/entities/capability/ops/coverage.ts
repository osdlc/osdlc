/**
 * `sdlc capability coverage` — the capability corpus joined against the
 * project's structure, both ways.
 *
 * The structural side is the manifest walk (`@sksizer/manifest-graph`): every
 * package and crate on disk, with its directory. The capability side is
 * `buildCapabilityGraph`. Each `locations[]` entry degrades to a path under
 * the five-form grammar and lands on the deepest unit whose directory
 * contains it. The report then answers the two questions a mapping pass
 * starts from: which units no capability anchors to, and which capabilities
 * anchor to nothing.
 *
 * Attachment counts the ways a capability is held in place: inbound
 * wikilinks from the rest of the planning corpus plus resolved locations. A
 * capability with zero attachments is a hand-maintained table-of-contents
 * row, and a candidate to fold or retire.
 *
 * `--scope` narrows the report to a directory or to one capability's
 * subtree. An unanchored capability has no location to fall outside a
 * directory scope, so it is listed under every directory scope.
 */

import { readFileSync } from 'node:fs'
import { basename as pathBasename, join, relative, resolve, sep } from 'node:path'

import { buildSystemGraph } from '@sksizer/manifest-graph'
import { isInside } from '@sksizer/path-guard'
import { z } from 'zod'

import { OpError, defineOp, type OpIo } from '@lib/registry'
import { isDir, rglob } from '@lib/util/fs'
import { locationPath, locationResolves } from '@lib/util/location'
import { cmpStr } from '@lib/util/strings'

import { CapabilityEntity } from '../schema.ts'
import { buildCapabilityGraph, type CapabilityGraphNode } from './graph.ts'

export const CoverageUnit = z
  .object({
    /** The structural node's id: its manifest name, else its directory. */
    id: z.string(),
    label: z.string(),
    /** Root-relative directory. */
    dir: z.string(),
    kind: z.string(),
    ecosystem: z.string().nullable(),
    /** Ids of every capability with a location under this unit, in or out of scope. */
    capabilities: z.array(z.string()),
  })
  .meta({ id: 'CapabilityCoverageUnit' })

export const CoverageCapability = CapabilityEntity.extend({
  /** Stored `locations[]` count. */
  location_count: z.number(),
  /** Locations that still resolve in the tree. */
  resolved: z.number(),
  /** Ids of the units its locations land on. */
  units: z.array(z.string()),
  /** Planning-corpus files that wikilink to this capability. */
  inbound: z.number(),
  /** `inbound + resolved`. */
  attachments: z.number(),
}).meta({ id: 'CapabilityCoverageCapability' })

export const AnchorRot = z
  .object({ capability: z.string(), location: z.string(), reason: z.string() })
  .meta({ id: 'CapabilityAnchorRot' })

export const CapabilityCoverage = z
  .object({
    root: z.string(),
    root_label: z.string(),
    /** The `--scope` as given, or null for the whole project. */
    scope: z.string().nullable(),
    units: z.array(CoverageUnit),
    /** Units in scope with no capability anchored to them. */
    unanchored_units: z.array(z.string()),
    capabilities: z.array(CoverageCapability),
    /** Capabilities in scope with no `locations[]` at all. */
    unanchored_capabilities: z.array(z.string()),
    anchor_rot: z.array(AnchorRot),
    /** The capability graph's warnings, passed through. */
    warnings: z.array(z.string()),
    /** Capability files read. */
    scanned: z.number(),
  })
  .meta({ id: 'CapabilityCoverage' })

export type CoverageUnit = z.infer<typeof CoverageUnit>
export type CoverageCapability = z.infer<typeof CoverageCapability>
export type AnchorRot = z.infer<typeof AnchorRot>
export type CapabilityCoverage = z.infer<typeof CapabilityCoverage>

const CAPABILITY_ID = /^C-[0-9A-Z]{4}$/

/**
 * A directory scope as a root-relative path. An absolute path is accepted
 * when it lies under the root; anything outside the tree, or not a
 * directory, is refused rather than read as an empty report.
 */
function scopeDir(root: string, scope: string): string {
  const abs = resolve(root, scope)
  const dir = isInside(root, abs) ? relative(root, abs).split(sep).join('/') : null
  if (dir === null || !isDir(join(root, dir))) {
    throw new OpError('INVALID_INPUT', `scope is not a directory under the project: ${scope}`)
  }
  return dir
}

function within(path: string, dir: string): boolean {
  return dir === '' || path === dir || path.startsWith(`${dir}/`)
}

/** Every `[[X-NNNN…]]` id a text wikilinks to, once each. */
function wikilinkedIds(text: string): Set<string> {
  const ids = new Set<string>()
  for (const m of text.matchAll(/\[\[([A-Z]{1,2}-[0-9A-Z]{4})(?:[-|#\]])/g)) {
    ids.add(m[1] as string)
  }
  return ids
}

/**
 * How many planning-corpus files wikilink to each id. A file counts once per
 * id it links, and a capability's own file never counts toward itself.
 */
function inboundCounts(planningDir: string, selfPaths: Map<string, string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const file of rglob(planningDir, (rel) => rel.endsWith('.md'))) {
    let text: string
    try {
      text = readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    for (const id of wikilinkedIds(text)) {
      if (selfPaths.get(id) === file) continue
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return counts
}

/** A capability id plus every descendant, by inverting `parent`. */
function subtreeOf(rootId: string, nodes: CapabilityGraphNode[]): Set<string> {
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parent === null) continue
    const list = children.get(n.parent) ?? []
    list.push(n.id)
    children.set(n.parent, list)
  }
  const out = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const id = queue.shift() as string
    if (out.has(id)) continue
    out.add(id)
    queue.push(...(children.get(id) ?? []))
  }
  return out
}

/**
 * Every on-disk package or crate as a coverage unit, plus a path→unit lookup
 * (deepest directory wins). The repo root and directory groups are
 * scaffolding, not places a capability is realized.
 */
function buildCoverageUnits(structure: Awaited<ReturnType<typeof buildSystemGraph>>): {
  units: CoverageUnit[]
  unitFor: (path: string) => CoverageUnit | null
} {
  const units: CoverageUnit[] = structure.nodes
    .filter(
      (n) =>
        n.dir !== null && n.dir !== '' && !n.external && n.kind !== 'repo' && n.kind !== 'group',
    )
    .map((n) => ({
      id: n.id,
      label: n.label,
      dir: n.dir as string,
      kind: n.kind,
      ecosystem: n.ecosystem,
      capabilities: [],
    }))
  // Deepest directory first, so the first containing unit is the tightest.
  const byDepth = [...units].sort((a, b) => b.dir.length - a.dir.length || cmpStr(a.dir, b.dir))
  const unitFor = (path: string): CoverageUnit | null =>
    byDepth.find((u) => within(path, u.dir)) ?? null
  return { units, unitFor }
}

/** Per-capability rollup built while walking every real (non-ghost) node. */
interface CapabilityRollup {
  capabilities: CoverageCapability[]
  anchorRot: AnchorRot[]
  unitIdsOf: Map<string, Set<string>>
  pathsOf: Map<string, string[]>
}

/**
 * Attach each real capability to the units its `locations[]` resolve onto,
 * tally resolved-vs-rotted locations, and fold in inbound wikilink counts to
 * produce the attachment score.
 */
function buildCapabilityRollup(
  root: string,
  real: CapabilityGraphNode[],
  unitFor: (path: string) => CoverageUnit | null,
  inbound: Map<string, number>,
): CapabilityRollup {
  const anchorRot: AnchorRot[] = []
  const capabilities: CoverageCapability[] = []
  const unitIdsOf = new Map<string, Set<string>>()
  const pathsOf = new Map<string, string[]>()
  for (const n of real) {
    let resolved = 0
    const unitIds = new Set<string>()
    const paths: string[] = []
    for (const loc of n.locations) {
      const res = locationResolves(root, loc)
      if (res.resolved) resolved += 1
      else anchorRot.push({ capability: n.id, location: loc, reason: res.reason })
      const path = locationPath(loc)
      if (path === null) continue
      paths.push(path)
      const unit = unitFor(path)
      if (unit !== null) unitIds.add(unit.id)
    }
    unitIdsOf.set(n.id, unitIds)
    pathsOf.set(n.id, paths)
    const inboundCount = inbound.get(n.id) ?? 0
    capabilities.push({
      id: n.id,
      basename: n.basename,
      title: n.title,
      kind: n.kind,
      state: n.state,
      parent: n.parent,
      location_count: n.locations.length,
      resolved,
      units: [...unitIds].sort(cmpStr),
      inbound: inboundCount,
      attachments: inboundCount + resolved,
    })
  }
  return { capabilities, anchorRot, unitIdsOf, pathsOf }
}

/**
 * The keep-predicates `--scope` applies: a capability id keeps its subtree
 * and the units that subtree anchors; a directory keeps the units under it
 * and the capabilities that touch it, plus every unanchored capability. No
 * scope keeps everything.
 */
function scopeFilters(
  scope: string | null,
  root: string,
  real: CapabilityGraphNode[],
  unitIdsOf: Map<string, Set<string>>,
  pathsOf: Map<string, string[]>,
): { keepCap: (c: CoverageCapability) => boolean; keepUnit: (u: CoverageUnit) => boolean } {
  if (scope === null) {
    return { keepCap: () => true, keepUnit: () => true }
  }
  if (CAPABILITY_ID.test(scope.toUpperCase())) {
    const subtree = subtreeOf(scope.toUpperCase(), real)
    const touched = new Set<string>()
    for (const id of subtree) for (const u of unitIdsOf.get(id) ?? []) touched.add(u)
    return { keepCap: (c) => subtree.has(c.id), keepUnit: (u) => touched.has(u.id) }
  }
  // Units under the directory, plus the unit the directory sits inside.
  const dir = scopeDir(root, scope)
  return {
    keepUnit: (u) => within(u.dir, dir) || within(dir, u.dir),
    keepCap: (c) => c.location_count === 0 || (pathsOf.get(c.id) ?? []).some((p) => within(p, dir)),
  }
}

/** Apply the scope's keep-predicates, cross-populate unit<->capability lists, and shape the final report. */
function assembleCoverage(opts: {
  root: string
  scope: string | null
  units: CoverageUnit[]
  capabilities: CoverageCapability[]
  unitIdsOf: Map<string, Set<string>>
  anchorRot: AnchorRot[]
  warnings: string[]
  scanned: number
  keepCap: (c: CoverageCapability) => boolean
  keepUnit: (u: CoverageUnit) => boolean
}): CapabilityCoverage {
  const { root, scope, units, capabilities, unitIdsOf, anchorRot, warnings, scanned } = opts
  const keptCaps = capabilities.filter(opts.keepCap).sort((a, b) => cmpStr(a.id, b.id))
  const keptUnits = units.filter(opts.keepUnit).sort((a, b) => cmpStr(a.dir, b.dir))
  const keptUnitIds = new Set(keptUnits.map((u) => u.id))
  // A unit's anchors come from EVERY capability, not only the ones the scope
  // keeps: a unit the scope sits inside is anchored by a capability whose
  // locations lie above the scope, and it must not read as unanchored.
  for (const c of capabilities) {
    for (const uid of unitIdsOf.get(c.id) ?? []) {
      const unit = keptUnits.find((u) => u.id === uid)
      if (unit !== undefined) unit.capabilities.push(c.id)
    }
  }
  for (const c of keptCaps) c.units = c.units.filter((uid) => keptUnitIds.has(uid))
  for (const u of keptUnits) u.capabilities.sort(cmpStr)
  const keptCapIds = new Set(keptCaps.map((c) => c.id))

  return {
    root,
    root_label: pathBasename(root),
    scope,
    units: keptUnits,
    unanchored_units: keptUnits.filter((u) => u.capabilities.length === 0).map((u) => u.id),
    capabilities: keptCaps,
    unanchored_capabilities: keptCaps.filter((c) => c.location_count === 0).map((c) => c.id),
    anchor_rot: anchorRot
      .filter((r) => keptCapIds.has(r.capability))
      .sort((a, b) => cmpStr(a.capability, b.capability) || cmpStr(a.location, b.location)),
    warnings,
    scanned,
  }
}

export async function buildCapabilityCoverage(
  root: string,
  opts: { scope?: string | null } = {},
): Promise<CapabilityCoverage> {
  const scope = opts.scope ?? null
  const planningDir = join(root, 'docs', 'planning')
  const graph = buildCapabilityGraph(root)
  const structure = await buildSystemGraph(root, { includeExternal: false })

  const { units, unitFor } = buildCoverageUnits(structure)

  const real = graph.nodes.filter((n) => !n.ghost)
  const selfPaths = new Map(
    real.map((n) => [n.id, join(planningDir, 'capabilities', `${n.basename}.md`)]),
  )
  const inbound = inboundCounts(planningDir, selfPaths)

  const { capabilities, anchorRot, unitIdsOf, pathsOf } = buildCapabilityRollup(
    root,
    real,
    unitFor,
    inbound,
  )
  const { keepCap, keepUnit } = scopeFilters(scope, root, real, unitIdsOf, pathsOf)

  return assembleCoverage({
    root,
    scope,
    units,
    capabilities,
    unitIdsOf,
    anchorRot,
    warnings: graph.warnings,
    scanned: graph.scanned,
    keepCap,
    keepUnit,
  })
}

function renderCoverage(out: CapabilityCoverage, io: OpIo): number {
  io.stdout(
    `units=${out.units.length} unanchored-units=${out.unanchored_units.length} ` +
      `capabilities=${out.capabilities.length} unanchored-capabilities=${out.unanchored_capabilities.length} ` +
      `rot=${out.anchor_rot.length} warnings=${out.warnings.length}\n`,
  )
  io.stdout('\nUNIT\tDIR\tCAPABILITIES (all anchors, in or out of scope)\n')
  for (const u of out.units) {
    io.stdout(
      `${u.id}\t${u.dir}\t${u.capabilities.length === 0 ? '-' : u.capabilities.join(',')}\n`,
    )
  }
  io.stdout('\nCAPABILITY\tLOCATIONS\tRESOLVED\tINBOUND\tUNITS\tTITLE\n')
  for (const c of out.capabilities) {
    io.stdout(
      `${c.id}\t${c.location_count}\t${c.resolved}\t${c.inbound}\t${c.units.length === 0 ? '-' : c.units.join(',')}\t${c.title}\n`,
    )
  }
  for (const r of out.anchor_rot) io.stdout(`rot: ${r.capability} ${r.location} (${r.reason})\n`)
  for (const w of out.warnings) io.stdout(`warning: ${w}\n`)
  return 0
}

export default defineOp({
  path: ['capability', 'coverage'],
  summary:
    'Join capabilities against packages and crates: unanchored units, unanchored capabilities, rot.',
  // Read-only: reads the capability corpus + on-disk manifest graph, writes
  // nothing.
  mutating: false,
  input: z.object({
    scope: z.string().nullable().default(null),
  }),
  output: CapabilityCoverage,
  cli: {
    flags: {
      scope: { valueName: 'DIR|C-NNNN', help: 'A directory, or a capability id for its subtree.' },
    },
    render: renderCoverage,
  },
  handler: (args, ctx) => buildCapabilityCoverage(ctx.projectRoot, { scope: args.scope }),
})
