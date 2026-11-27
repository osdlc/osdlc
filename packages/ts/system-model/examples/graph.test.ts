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
import type {
  Aspect as RootAspect,
  AspectId as RootAspectId,
  DepKind as RootDepKind,
  Ecosystem as RootEcosystem,
  Evidence as RootEvidence,
  EvidenceKind as RootEvidenceKind,
  NodeKind as RootNodeKind,
  SpecifierKind as RootSpecifierKind,
  SystemEdge as RootSystemEdge,
  SystemGraph as RootSystemGraph,
  SystemNode as RootSystemNode,
} from '@osdlc/system-model'
import {
  ALL_ASPECTS as ROOT_ALL_ASPECTS,
  ALL_DEP_KINDS as ROOT_ALL_DEP_KINDS,
  ALL_NODE_KINDS as ROOT_ALL_NODE_KINDS,
  ALL_SPECIFIER_KINDS as ROOT_ALL_SPECIFIER_KINDS,
  EVIDENCE_TIERS as ROOT_EVIDENCE_TIERS,
  hasAspect as rootHasAspect,
  strongestTier as rootStrongestTier,
} from '@osdlc/system-model'

// The wire contract: a consumer reads the graph a host serves.
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
  test('a consumer reads the graph a host serves', () => {
    expect(graph.nodes[0]!.ecosystem).toBe('node')
    expect(ALL_NODE_KINDS).toContain('package')
    expect(ALL_DEP_KINDS).toContain('prod')
    expect(ALL_SPECIFIER_KINDS).toContain('workspace')
  })

  test('aspects carry tiered evidence', () => {
    expect(ALL_ASPECTS).toContain('vue')
    expect(hasAspect(node.aspects, 'vue')).toBe(true)
    expect(strongestTier(node.aspects)).toBe(2)
  })

  test('the root entry carries the same contract', () => {
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

    expect(rootGraph.nodes).toHaveLength(1)
    expect(ROOT_ALL_ASPECTS).toContain(rootAspectId)
    expect(rootHasAspect(rootNode.aspects, 'typescript')).toBe(true)
    expect(rootStrongestTier(rootNode.aspects)).toBe(3)
    expect(ROOT_ALL_NODE_KINDS).toContain(kinds[0])
    expect(ROOT_ALL_DEP_KINDS).toContain(kinds[1])
    expect(ROOT_ALL_SPECIFIER_KINDS).toContain(kinds[2])
  })
})
