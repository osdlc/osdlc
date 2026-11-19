/**
 * The gate for the containment contract, over a
 * fixture tree that is a miniature monorepo: two ecosystems, a virtual cargo
 * workspace root, a Nuxt layer, a binary, and one deliberately malformed
 * manifest.
 *
 * The fixture tree is the `system-model` crate's — this suite and
 * `cargo test -p system-model` walk the SAME directories and assert the same
 * contract, which is the whole drift gate between the two implementations. A
 * change to one that the other does not match fails here.
 */

import { beforeAll, describe, expect, test } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyContainment } from '../src/containment.ts'
import { buildDependencyGraph } from '../src/dependency-graph.ts'
import { walkManifests } from '../src/manifest-walk.ts'
import type { DependencyGraph, ManifestInfo } from '../src/manifest-model.ts'

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

describe('applyContainment', () => {
  const contained = (includeExternal: boolean): DependencyGraph => {
    const graph = buildDependencyGraph(manifests, { includeExternal })
    applyContainment(graph)
    return graph
  }

  const parentOf = (graph: DependencyGraph, id: string): string =>
    graph.nodes.find((n) => n.id === id)!.parent ?? ''

  test('the repo node is synthetic and top-level manifests are its children', () => {
    const graph = contained(false)
    expect(graph.nodes.filter((n) => n.parent === null).map((n) => n.id)).toEqual(['repo:root'])

    const repo = graph.nodes.find((n) => n.id === 'repo:root')!
    expect(repo.kind).toBe('repo')
    expect(repo.name).toBe('repository')
    expect(repo.manifest).toBeUndefined() // the checkout is not one of its own manifests

    // The root package.json is a package that lives at the top of the
    // checkout, not the checkout itself.
    const rootPkg = graph.nodes.find((n) => n.id === 'mini-root')!
    expect(rootPkg.kind).toBe('package')
    expect(rootPkg.parent).toBe('repo:root')
  })

  test('a group appears only where a directory holds manifests but declares none', () => {
    const graph = contained(false)
    // `crates` holds a manifest of its own (the virtual workspace root), so it
    // is not synthetic. `layers` is chain-collapsed — see below.
    expect(graph.nodes.filter((n) => n.kind === 'group').map((n) => n.dir ?? '')).toEqual([
      'packages',
    ])
  })

  test('a single-child group is collapsed away', () => {
    const graph = contained(false)
    // `layers/` holds exactly one manifest, so a `layers` box would say nothing
    // `layers/layer-ui` does not already say: the layer parents to the repo.
    expect(graph.nodes.every((n) => n.dir !== 'layers')).toBe(true)
    expect(graph.nodes.find((n) => n.id === '@mini/layer-ui')!.parent).toBe('repo:root')
  })

  test('manifests parent to their nearest container', () => {
    const graph = contained(false)
    expect(parentOf(graph, '@mini/pkg-a')).toBe('packages')
    expect(parentOf(graph, '@mini/pkg-b')).toBe('packages')
    expect(parentOf(graph, 'packages')).toBe('repo:root')
    // `crates` is a real (virtual-workspace) manifest, and its members nest
    // under it rather than under a synthetic sibling.
    expect(parentOf(graph, 'crate-one')).toBe('crates')
    expect(parentOf(graph, 'crate-two')).toBe('crates')
    expect(parentOf(graph, 'crates')).toBe('repo:root')
  })

  test('every in-set node reaches the root by walking parents', () => {
    const graph = contained(false)
    for (const node of graph.nodes.filter((n) => !n.external)) {
      const seen = [node.id]
      let cursor = node.parent
      while (cursor !== null) {
        expect(seen).not.toContain(cursor)
        seen.push(cursor)
        cursor = graph.nodes.find((n) => n.id === cursor)!.parent
      }
      expect(seen.at(-1)).toBe('repo:root')
    }
  })

  test('externals gather under one group per ecosystem, outside the repo', () => {
    const graph = contained(true)
    expect(parentOf(graph, 'lodash')).toBe('external:node')
    expect(parentOf(graph, 'vue')).toBe('external:node')
    expect(parentOf(graph, 'serde')).toBe('external:rust')
    expect(parentOf(graph, 'cc')).toBe('external:rust')

    // A registry package is not *within* the repo, so its group is a second
    // containment root rather than a child of it.
    expect(graph.nodes.filter((n) => n.parent === null).map((n) => n.id)).toEqual([
      'repo:root',
      'external:node',
      'external:rust',
    ])
  })

  test('a group keeps a short label where its parent is its literal prefix', () => {
    // `layers` collapsed away, so nothing here spans segments — assert the
    // ordinary case reads short, and cover the spanning case on the real repo
    // (repo-smoke.test.ts), where `tools/cage/crates` exercises it.
    const graph = contained(false)
    expect(graph.nodes.find((n) => n.id === 'packages')!.name).toBe('packages')
  })

  // A second pass must land exactly where a first pass with the same options
  // lands: the synthetic ids (`repo:root`, `external:*`, the group dirs) are
  // minted unconditionally, so a pass that did not first undo its predecessor
  // would append a second `repo:root` and a second group per ecosystem — and
  // one that simply bailed out would silently drop this call's options.
  for (const options of [{}, { rootLabel: 'checkout', groupExternals: false }]) {
    test(`a second pass re-derives, honouring ${JSON.stringify(options)}`, () => {
      const twice = buildDependencyGraph(manifests, { includeExternal: true })
      applyContainment(twice)
      applyContainment(twice, options)

      const once = buildDependencyGraph(manifests, { includeExternal: true })
      applyContainment(once, options)

      expect(twice.nodes.map((n) => n.id)).toEqual(once.nodes.map((n) => n.id))
      expect(twice).toEqual(once)
    })
  }

  test('containment never invents dependency edges', () => {
    const bare = buildDependencyGraph(manifests)
    expect(contained(false).edges).toEqual(bare.edges)
  })
})
