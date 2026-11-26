/**
 * Walk a tree, build the dependency graph, and read the edges back.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import {
  DEFAULT_EXCLUDES,
  MANIFEST_FILES,
  ROOT_ID,
  applyContainment,
  buildDependencyGraph,
  buildSystemGraph,
  scanAspects,
  walkManifests,
  type ContainmentOptions,
  type DepDecl,
  type DependencyGraph,
  type GraphEdge,
  type GraphNode,
  type GraphOptions,
  type ManifestInfo,
  type SystemGraphOptions,
  type WalkOptions,
} from '@osdlc/system-model/build'

const root = mkdtempSync(join(tmpdir(), 'system-model-build-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

test('two workspace packages produce one dependency edge', async () => {
  mkdirSync(join(root, 'pkg-a'))
  mkdirSync(join(root, 'pkg-b'))
  mkdirSync(join(root, 'node_modules'))
  writeFileSync(
    join(root, 'pkg-a', 'package.json'),
    JSON.stringify({ name: 'pkg-a', dependencies: { 'pkg-b': 'workspace:*' } }),
  )
  writeFileSync(join(root, 'pkg-b', 'package.json'), JSON.stringify({ name: 'pkg-b' }))

  const walk: WalkOptions = { exclude: ['scratch'] }
  const manifests: ManifestInfo[] = await walkManifests(root, walk)
  const options: GraphOptions = { includeExternal: false }
  const graph: DependencyGraph = buildDependencyGraph(manifests, options)

  const edges: GraphEdge[] = graph.edges
  const nodes: GraphNode[] = graph.nodes
  const deps: DepDecl[] = manifests.find((m) => m.name === 'pkg-a')!.deps
  expect(edges.map((edge) => `${edge.from} -> ${edge.to}`)).toEqual(['pkg-a -> pkg-b'])
  expect(nodes.map((n) => n.id)).toEqual(['pkg-a', 'pkg-b'])
  expect(deps.map((d) => d.specifierKind)).toEqual(['workspace'])
  expect(DEFAULT_EXCLUDES).toContain('node_modules')

  // Pick manifests out of a file list, as a caller with no directory to walk does.
  const listed = ['pkg-a/package.json', 'pkg-a/README.md', 'crates/x/Cargo.toml']
  const isManifest = (path: string) =>
    (MANIFEST_FILES as readonly string[]).includes(path.slice(path.lastIndexOf('/') + 1))
  expect(listed.filter(isManifest)).toEqual(['pkg-a/package.json', 'crates/x/Cargo.toml'])

  const containment: ContainmentOptions = {}
  applyContainment(graph, containment)
  expect(graph.nodes.find((n) => n.id === 'pkg-a')!.parent).toBe(ROOT_ID)
  expect(Array.isArray(scanAspects(manifests[0]!))).toBe(true)
})

test('buildSystemGraph returns the wire payload', async () => {
  const options: SystemGraphOptions = { includeExternal: false }
  const payload = await buildSystemGraph(root, options)
  expect(payload.edges.map((e) => `${e.from} -> ${e.to}`)).toEqual(['pkg-a -> pkg-b'])
  expect(payload.manifests_scanned).toBe(2)
})
