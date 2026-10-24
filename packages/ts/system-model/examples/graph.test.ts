import { describe, expect, test } from 'vitest'
import {
  ALL_DEP_KINDS,
  ALL_NODE_KINDS,
  ALL_SPECIFIER_KINDS,
  type DepKind,
  type Ecosystem,
  type NodeKind,
  type SpecifierKind,
  type SystemEdge,
  type SystemGraph,
  type SystemNode,
} from '@osdlc/system-model/graph'
import {
  ALL_ASPECTS,
  EVIDENCE_TIERS,
  hasAspect,
  strongestTier,
  type Aspect,
  type AspectId,
  type Evidence,
  type EvidenceKind,
} from '@osdlc/system-model/aspect'
import type { SystemGraphClient } from '@osdlc/system-model/client'
import {
  SLUG_PATTERN,
  slugify,
  type PositionOverride,
  type SavedView,
  type SavedViewStore,
} from '@osdlc/system-model/saved-view'
import type {
  Aspect as RootAspect,
  AspectId as RootAspectId,
  DepKind as RootDepKind,
  Ecosystem as RootEcosystem,
  Evidence as RootEvidence,
  EvidenceKind as RootEvidenceKind,
  NodeKind as RootNodeKind,
  PositionOverride as RootPositionOverride,
  ProjectFacets,
  ProjectFacetsStore,
  SavedView as RootSavedView,
  SavedViewStore as RootSavedViewStore,
  SpecifierKind as RootSpecifierKind,
  SystemEdge as RootSystemEdge,
  SystemGraph as RootSystemGraph,
  SystemGraphClient as RootSystemGraphClient,
  SystemNode as RootSystemNode,
} from '@osdlc/system-model'
import {
  ALL_ASPECTS as ROOT_ALL_ASPECTS,
  ALL_DEP_KINDS as ROOT_ALL_DEP_KINDS,
  ALL_NODE_KINDS as ROOT_ALL_NODE_KINDS,
  ALL_SPECIFIER_KINDS as ROOT_ALL_SPECIFIER_KINDS,
  EVIDENCE_TIERS as ROOT_EVIDENCE_TIERS,
  SLUG_PATTERN as ROOT_SLUG_PATTERN,
  hasAspect as rootHasAspect,
  slugify as rootSlugify,
  strongestTier as rootStrongestTier,
} from '@osdlc/system-model'

// The wire contract: a host satisfies the client port, a consumer reads the
// graph it serves, and a store keeps named views of it.
const kind: EvidenceKind = 'dependency'
const evidence: Evidence = {
  kind,
  tier: EVIDENCE_TIERS[kind],
  source: 'dependencies.vue',
  found: '^3.5.0',
}
const aspectId: AspectId = 'vue'
const aspect: Aspect = { id: aspectId, tier: evidence.tier, evidence: [evidence] }

const nodeKind: NodeKind = 'package'
const ecosystem: Ecosystem = 'node'
const node: SystemNode = {
  id: '@acme/ui',
  label: '@acme/ui',
  dir: 'packages/ui',
  parent: 'repo:root',
  kind: nodeKind,
  ecosystem,
  external: false,
  description: null,
  private: true,
  is_nuxt_layer: false,
  has_bin: false,
  error: null,
  aspects: [aspect],
}
const depKind: DepKind = 'prod'
const specifierKind: SpecifierKind = 'workspace'
const edge: SystemEdge = {
  from: '@acme/app',
  to: '@acme/ui',
  kind: depKind,
  specifier_kind: specifierKind,
  specifier: 'workspace:*',
}
const graph: SystemGraph = {
  root: '/work/acme',
  root_label: 'acme',
  include_external: false,
  nodes: [node],
  edges: [edge],
  warnings: [],
  manifests_scanned: 1,
}

describe('the wire contract', () => {
  test('a host satisfies the client port and a consumer reads the graph it serves', async () => {
    const client: SystemGraphClient = { graph: async () => graph }
    const served = await client.graph(false)
    expect(served.nodes[0]!.ecosystem).toBe('node')
    expect(ALL_NODE_KINDS).toContain('package')
    expect(ALL_DEP_KINDS).toContain('prod')
    expect(ALL_SPECIFIER_KINDS).toContain('workspace')
  })

  test('aspects carry tiered evidence', () => {
    expect(ALL_ASPECTS).toContain('vue')
    expect(hasAspect(node.aspects, 'vue')).toBe(true)
    expect(strongestTier(node.aspects)).toBe(2)
  })

  test('a store keeps saved views by slug', async () => {
    const views = new Map<string, SavedView>()
    const store: SavedViewStore = {
      list: async () => [...views.values()],
      save: async (view) => void views.set(view.slug, view),
      remove: async (slug) => void views.delete(slug),
    }
    const moved: PositionOverride = { x: 10, y: 20 }
    const slug = slugify('Only the UI')
    expect(slug).toMatch(SLUG_PATTERN)
    await store.save({
      slug,
      title: 'Only the UI',
      description: null,
      spec: {},
      overlay: { '@acme/ui': moved },
    })
    expect((await store.list()).map((v) => v.slug)).toEqual(['only-the-ui'])
  })

  test('the root entry carries the same contract, and project facets', async () => {
    const rootKind: RootEvidenceKind = 'files'
    const rootEvidence: RootEvidence = {
      ...evidence,
      kind: rootKind,
      tier: ROOT_EVIDENCE_TIERS[rootKind],
    }
    const rootAspectId: RootAspectId = 'typescript'
    const rootAspect: RootAspect = { id: rootAspectId, tier: 3, evidence: [rootEvidence] }
    const rootNode: RootSystemNode = { ...node, aspects: [rootAspect] }
    const rootEdge: RootSystemEdge = edge
    const rootGraph: RootSystemGraph = { ...graph, nodes: [rootNode], edges: [rootEdge] }
    const kinds: [RootNodeKind, RootDepKind, RootSpecifierKind, RootEcosystem] = [
      'crate',
      'dev',
      'path',
      'rust',
    ]
    const client: RootSystemGraphClient = { graph: async () => rootGraph }
    const facets: ProjectFacets = {
      id: 'ui',
      dir: 'packages/ui',
      layer: 'library',
      stack: 'frontend',
      language: 'typescript',
    }
    const facetsStore: ProjectFacetsStore = { list: async () => [facets] }
    const position: RootPositionOverride = { x: 0, y: 0 }
    const view: RootSavedView = {
      slug: rootSlugify('All'),
      title: 'All',
      description: null,
      spec: {},
      overlay: { '@acme/ui': position },
    }
    const viewStore: RootSavedViewStore = {
      list: async () => [view],
      save: async () => {},
      remove: async () => {},
    }

    expect(ROOT_ALL_ASPECTS).toContain(rootAspectId)
    expect(rootHasAspect(rootNode.aspects, 'typescript')).toBe(true)
    expect(rootStrongestTier(rootNode.aspects)).toBe(3)
    expect(ROOT_ALL_NODE_KINDS).toContain(kinds[0])
    expect(ROOT_ALL_DEP_KINDS).toContain(kinds[1])
    expect(ROOT_ALL_SPECIFIER_KINDS).toContain(kinds[2])
    expect((await client.graph(true)).nodes).toHaveLength(1)
    // Facets join to graph nodes by directory.
    expect((await facetsStore.list())[0]!.dir).toBe(rootNode.dir)
    expect((await viewStore.list())[0]!.slug).toMatch(ROOT_SLUG_PATTERN)
  })
})
