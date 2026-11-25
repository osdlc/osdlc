/**
 * The gate for the walk + dependency-graph contract, over a
 * fixture tree that is a miniature monorepo: two ecosystems, a virtual cargo
 * workspace root, a Nuxt layer, a binary, and one deliberately malformed
 * manifest.
 *
 * The fixture tree is shared with the Rust peer, which arrives in a later
 * change and will walk the SAME directories and assert the same contract.
 */

import { beforeAll, describe, expect, test } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDependencyGraph } from '../src/dependency-graph.ts'
import { MANIFEST_FILES, walkManifests } from '../src/manifest-walk.ts'
import type { ManifestInfo } from '../src/manifest-model.ts'

const here = dirname(fileURLToPath(import.meta.url))
/**
 * `fixtures/mini-repo` is a symlink to the reference crate's copy — ONE corpus,
 * reachable from either package by a local path. `walkManifests` skips
 * symlinked entries it meets during a walk, but resolves the root it is handed,
 * so pointing it here reads the real tree; and the repo-wide smoke walk still
 * meets these manifests once, under the crate.
 */
const ROOT = join(here, 'fixtures/mini-repo')

let manifests: ManifestInfo[]

beforeAll(async () => {
  manifests = await walkManifests(ROOT)
})

function byDir(dir: string): ManifestInfo {
  const m = manifests.find((m) => m.dir === dir)
  if (!m) throw new Error(`no manifest at dir "${dir}"`)
  return m
}

function dep(m: ManifestInfo, name: string) {
  const d = m.deps.find((d) => d.name === name)
  if (!d) throw new Error(`no dep "${name}" on ${m.dir}`)
  return [d.kind, d.specifier, d.specifierKind]
}

// ---------------------------------------------------------------------------
// walkManifests
// ---------------------------------------------------------------------------

describe('walkManifests', () => {
  test('finds every manifest in the tree', () => {
    expect(manifests.map((m) => m.dir)).toEqual([
      '', // mini-repo root package.json
      'crates',
      'crates/crate-one',
      'crates/crate-two',
      'layers/layer-ui',
      'packages/broken',
      'packages/pkg-a',
      'packages/pkg-b',
      'packages/pkg-c',
    ])
  })

  test('tags ecosystems and reads the basics', () => {
    const root = byDir('')
    expect(root.ecosystem).toBe('node')
    expect(root.name).toBe('mini-root')
    expect(root.private).toBe(true)
    expect(root.workspaces).toEqual(['packages/*', 'layers/*'])

    const a = byDir('packages/pkg-a')
    expect(a.ecosystem).toBe('node')
    expect(a.version).toBe('1.0.0')
    expect(a.description).toBe('Depends on pkg-b in-workspace and lodash externally')

    const one = byDir('crates/crate-one')
    expect(one.ecosystem).toBe('rust')
    expect(one.name).toBe('crate-one')
    expect(one.version).toBe('0.1.0')
  })

  test('derived hints: nuxt layer and bin', () => {
    expect(byDir('layers/layer-ui').isNuxtLayer).toBe(true)
    expect(byDir('packages/pkg-a').isNuxtLayer).toBe(false)
    expect(byDir('packages/pkg-c').hasBin).toBe(true)
    expect(byDir('packages/pkg-b').hasBin).toBe(false)
  })

  test('a virtual cargo workspace root has no name but lists members', () => {
    const ws = byDir('crates')
    expect(ws.name).toBeNull()
    expect(ws.workspaces).toEqual(['crate-one', 'crate-two'])
  })

  test('cargo publish = false maps to private', () => {
    expect(byDir('crates/crate-two').private).toBe(true)
    expect(byDir('crates/crate-one').private).toBe(false)
  })

  test('a malformed manifest becomes an error entry, not a throw', () => {
    const broken = byDir('packages/broken')
    expect(broken.error).toBeTruthy()
    expect(broken.name).toBeNull()
    expect(broken.deps).toEqual([])
  })

  test('node dep kinds and specifier kinds', () => {
    const a = byDir('packages/pkg-a')
    expect(a.deps.length).toBe(2)
    expect(dep(a, '@mini/pkg-b')).toEqual(['prod', 'workspace:*', 'workspace'])
    expect(dep(a, 'lodash')).toEqual(['prod', '^4.17.21', 'registry'])

    const b = byDir('packages/pkg-b')
    expect(b.deps.length).toBe(2)
    expect(dep(b, 'vue')).toEqual(['peer', '^3.0.0', 'registry'])
    expect(dep(b, 'fsevents')).toEqual(['optional', '^2.3.0', 'registry'])

    const c = byDir('packages/pkg-c')
    expect(c.deps.length).toBe(1)
    expect(dep(c, '@mini/pkg-b')).toEqual(['prod', 'file:../pkg-b', 'file'])
  })

  test('cargo dep kinds and specifier kinds', () => {
    const one = byDir('crates/crate-one')
    expect(one.deps.length).toBe(4)
    expect(dep(one, 'crate-two')).toEqual(['prod', '../crate-two', 'path'])
    expect(dep(one, 'serde')).toEqual(['prod', '1', 'registry'])
    expect(dep(one, 'tempfile')).toEqual(['dev', '3', 'registry'])
    expect(dep(one, 'cc')).toEqual(['build', '1.0', 'registry'])
  })

  test('MANIFEST_FILES names the file of every manifest the walk finds', () => {
    const names = new Set(manifests.map((m) => m.path.slice(m.path.lastIndexOf('/') + 1)))
    expect([...names].sort()).toEqual([...MANIFEST_FILES].sort())
  })

  test('the exclude option skips caller-named directories', async () => {
    const without = await walkManifests(ROOT, { exclude: ['crates'] })
    expect(without.every((m) => m.ecosystem !== 'rust')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildDependencyGraph
// ---------------------------------------------------------------------------

describe('buildDependencyGraph', () => {
  test('one node per manifest, externals dropped by default', () => {
    const graph = buildDependencyGraph(manifests)
    expect(graph.nodes.length).toBe(manifests.length)
    expect(graph.warnings).toEqual([])
    expect(graph.nodes.every((n) => !n.external)).toBe(true)

    // The virtual cargo workspace root falls back to its dir as id.
    const ws = graph.nodes.find((n) => n.dir === 'crates')!
    expect(ws.id).toBe('crates')
    expect(ws.name).toBeNull()

    expect(graph.edges.map((e) => `${e.from} -[${e.kind}/${e.specifierKind}]-> ${e.to}`)).toEqual([
      '@mini/layer-ui -[prod/workspace]-> @mini/pkg-b',
      '@mini/pkg-a -[prod/workspace]-> @mini/pkg-b',
      '@mini/pkg-c -[prod/file]-> @mini/pkg-b',
      'crate-one -[prod/path]-> crate-two',
    ])
  })

  test('includeExternal materializes external nodes and their edges', () => {
    const graph = buildDependencyGraph(manifests, { includeExternal: true })

    const externalIds = graph.nodes.filter((n) => n.external).map((n) => n.id)
    expect(externalIds).toEqual(['cc', 'fsevents', 'lodash', 'serde', 'tempfile', 'vue'])
    expect(
      graph.nodes
        .filter((n) => n.external)
        .every((n) => n.dir === null && n.manifest === undefined),
    ).toBe(true)

    const eco = (id: string) => graph.nodes.find((n) => n.id === id)!.ecosystem
    expect(eco('serde')).toBe('rust')
    expect(eco('lodash')).toBe('node')

    const kindOf = (id: string) => {
      const e = graph.edges.find((e) => e.to === id)
      if (!e) throw new Error(`no edge to ${id}`)
      return e.kind
    }
    expect(kindOf('vue')).toBe('peer')
    expect(kindOf('fsevents')).toBe('optional')
    expect(kindOf('tempfile')).toBe('dev')
    expect(kindOf('cc')).toBe('build')
    expect(kindOf('lodash')).toBe('prod')

    // In-set edges are unchanged by the option.
    expect(graph.edges.length).toBe(4 + externalIds.length)
  })
})

describe('buildDependencyGraph id collisions', () => {
  const mk = (
    ecosystem: 'node' | 'cargo',
    dir: string,
    name: string,
    deps: string[] = [],
  ): ManifestInfo =>
    ({
      path: `/r/${dir}/x`,
      dir,
      ecosystem,
      name,
      version: null,
      private: false,
      description: null,
      workspaces: [],
      entry: { main: null, types: null },
      isNuxtLayer: false,
      hasBin: false,
      deps: deps.map((d) => ({ name: d, specifier: '*', kind: 'normal' })),
      error: null,
    }) as unknown as ManifestInfo

  test('a node package and a crate sharing a name fall back to the directory', () => {
    const g = buildDependencyGraph([mk('node', 'a', 'x'), mk('cargo', 'b', 'x')])
    expect(g.nodes.map((n) => n.id)).toEqual(['x', 'b'])
    expect(g.warnings).toHaveLength(1)
  })

  test('two packages sharing a name warn, and edges go to the first', () => {
    const g = buildDependencyGraph([
      mk('node', 'a', 'x'),
      mk('node', 'b', 'x'),
      mk('node', 'c', 'y', ['x']),
    ])
    expect(g.warnings.some((w) => w.includes('duplicate node manifest name "x"'))).toBe(true)
    expect(g.edges.map((e) => [e.from, e.to])).toEqual([['y', 'x']])
  })

  test('an external dependency named like an in-set id takes the #external suffix', () => {
    const g = buildDependencyGraph([mk('node', 'a', 'x', ['dep']), mk('cargo', 'b', 'dep')], {
      includeExternal: true,
    })
    expect(g.nodes.find((n) => n.external)?.id).toBe('dep#external')
  })
})
