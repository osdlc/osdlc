import { describe, expect, test } from 'vitest'
import {
  BUILTIN_CATALOGUE,
  BUILTIN_QUERY,
  KEY_ENV_PATTERN,
  MACHINE_CATALOGUE_VERSION,
  MODELS_DEV_URL,
  MODEL_KEY_PATTERN,
  CuratedOfferSchema,
  MachineCatalogueSchema,
  ModelRowSchema,
  OfferingRowSchema,
  RouterConfigSchema,
  SNAPSHOT_LAYER,
  SnapshotLayerSchema,
  configLayer,
  deriveOfferings,
  diffCatalogues,
  layerCatalogue,
  mappingPolicy,
  modelsDevRow,
  modelsDevRows,
  nativeName,
  queryCatalogue,
  tierTable,
  unclassifiedFamilies,
  type CatalogueLayer,
  type MappingPolicy,
} from '@osdlc/agent-router'

// A tiny catalogue of our own, so nothing here depends on the shipped snapshot.
const base: CatalogueLayer = {
  source: 'models.dev',
  observed_at: '2026-01-01',
  providers: { acme: { kind: 'openai-compatible' } },
  tools: { runner: { serves: ['acme'], openness: 'closed', modes: ['headless'] } },
  models: {
    'acme/mini-1': { family: 'acme-mini', traits: ['agent'], release_date: '2026-01-01' },
    'acme/pro-1': {
      family: 'acme-pro',
      traits: ['agent'],
      release_date: '2026-02-01',
      context: { default: 200_000, max: 1_000_000 },
      efforts: ['low', 'medium', 'high'],
    },
  },
}
const policy: MappingPolicy = {
  classify: [{ provider: 'acme', families: { 'acme-mini': 'fast', 'acme-pro': 'max' } }],
}

describe('layering', () => {
  test('layerCatalogue merges layers, lowest first, and keeps where each field came from', () => {
    const override: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-03-01',
      models: { 'acme/pro-1': { context: { max: 2_000_000 } } },
    }
    const catalogue = layerCatalogue([base, override])
    const pro = catalogue.models['acme/pro-1']!
    expect(pro.context?.max).toBe(2_000_000)
    expect(pro.family).toBe('acme-pro')
    expect(pro.fields.context?.source).toBe('config')
    expect(pro.fields.family?.source).toBe('models.dev')
    expect(catalogue.problems).toEqual([])
  })

  test('layerCatalogue reports a row that lacks a required field', () => {
    const half: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-03-01',
      tools: { half: { openness: 'closed' } },
    }
    const catalogue = layerCatalogue([base, half])
    expect(catalogue.tools.half).toBeUndefined()
    expect(catalogue.problems[0]?.table).toBe('tools')
  })

  test('configLayer turns a parsed `router:` block into a config layer', () => {
    const router = RouterConfigSchema.parse({
      providers: { local: { kind: 'ollama' } },
      strict: true,
      pins: { 'runner/max': 'pro-1' },
    })
    const layer = configLayer(router, '2026-03-01')
    expect(layer).toEqual({
      source: 'config',
      observed_at: '2026-03-01',
      providers: { local: { kind: 'ollama' } },
    })
  })

  test('mappingPolicy takes the classifier rules, chain order and pins of a block', () => {
    const router = RouterConfigSchema.parse({
      chains: { order: ['runner'] },
      pins: { 'runner/max': 'pro-1' },
    })
    expect(mappingPolicy(router)).toEqual({ order: ['runner'], pins: { 'runner/max': 'pro-1' } })
    expect(mappingPolicy(undefined)).toEqual({})
  })
})

describe('querying', () => {
  const query = queryCatalogue(layerCatalogue([base]), policy)

  test('queryCatalogue answers questions about tools and models', () => {
    expect(query.knownTools()).toEqual(['runner'])
    expect(query.findModel('runner', 'pro-1')?.model.key).toBe('acme/pro-1')
    expect(query.effortsFor('runner', 'pro-1')).toEqual(['low', 'medium', 'high'])
  })

  test('the mapping policy places models in tiers', () => {
    expect(query.tierOf('acme/pro-1')).toBe('max')
    expect(query.tierModel('runner', 'max')).toBe('pro-1')
    expect(query.tierModel('runner', 'standard')).toBeUndefined()
  })

  test('a pin holds a tier on a model whatever the classifier picks', () => {
    const pinned = queryCatalogue(layerCatalogue([base]), {
      ...policy,
      pins: { 'runner/max': 'mini-1' },
    })
    expect(pinned.tierModel('runner', 'max')).toBe('mini-1')
    expect(pinned.pinned('runner', 'max')).toBe(true)
  })
})

describe('offerings', () => {
  test('deriveOfferings joins each tool to the models of the providers it serves', () => {
    const offerings = deriveOfferings(layerCatalogue([base]))
    expect(offerings.map((o) => `${o.tool} ${o.model} ${o.native_name}`)).toEqual([
      'runner acme/mini-1 mini-1',
      'runner acme/pro-1 pro-1',
    ])
  })

  test('an offering row can remove a combination', () => {
    const trim: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-03-01',
      offerings: [{ tool: 'runner', model: 'acme/mini-1', remove: true }],
    }
    const offerings = deriveOfferings(layerCatalogue([base, trim]))
    expect(offerings.map((o) => o.model)).toEqual(['acme/pro-1'])
  })

  test('nativeName decides what a tool is handed for a model', () => {
    const model = { key: 'acme/pro-1', provider: 'acme', id: 'pro-1' }
    expect(nativeName({ openness: 'closed' }, model)).toBe('pro-1')
    expect(nativeName({ openness: 'open' }, model)).toBe('acme/pro-1')
    expect(nativeName({ openness: 'curated' }, model, 'the-pro')).toBe('the-pro')
    const aliased = {
      openness: 'closed',
      prefer_alias: true,
      aliases: { big: 'acme/pro-1' },
    } as const
    expect(nativeName(aliased, model)).toBe('big')
  })
})

describe('the shipped snapshot', () => {
  test('SNAPSHOT_LAYER is the lowest layer and matches its schema', () => {
    expect(SNAPSHOT_LAYER.source).toBe('snapshot')
    expect(SnapshotLayerSchema.safeParse(SNAPSHOT_LAYER).success).toBe(true)
  })

  test('BUILTIN_CATALOGUE is the snapshot merged, with nothing wrong in it', () => {
    expect(BUILTIN_CATALOGUE.problems).toEqual([])
    expect(Object.keys(BUILTIN_CATALOGUE.tools).length).toBeGreaterThan(0)
  })

  test('BUILTIN_QUERY maps a tier to a model name for a tool', () => {
    const tool = BUILTIN_QUERY.knownTools()[0]!
    const name = BUILTIN_QUERY.tierModel(tool, 'max')
    expect(name === undefined || typeof name === 'string').toBe(true)
    expect(BUILTIN_QUERY.tool(tool)?.id).toBe(tool)
  })
})

describe('schemas and patterns', () => {
  test('KEY_ENV_PATTERN accepts a variable name, MODEL_KEY_PATTERN a provider/id', () => {
    expect(KEY_ENV_PATTERN.test('ACME_API_KEY')).toBe(true)
    expect(KEY_ENV_PATTERN.test('sk-live-123')).toBe(false)
    expect(MODEL_KEY_PATTERN.test('ollama/qwen3:4b')).toBe(true)
    expect(MODEL_KEY_PATTERN.test('qwen3')).toBe(false)
  })

  test('ModelRowSchema, CuratedOfferSchema and OfferingRowSchema are strict', () => {
    expect(ModelRowSchema.safeParse({ family: 'acme-pro', traits: ['agent'] }).success).toBe(true)
    expect(ModelRowSchema.safeParse({ colour: 'red' }).success).toBe(false)
    expect(CuratedOfferSchema.safeParse({ model: 'acme/pro-1', native_name: 'pro' }).success).toBe(
      true,
    )
    expect(
      OfferingRowSchema.safeParse({ tool: 'runner', model: 'acme/pro-1', remove: true }).success,
    ).toBe(true)
  })

  test('RouterConfigSchema checks a `router:` block', () => {
    expect(RouterConfigSchema.safeParse({ strict: true }).success).toBe(true)
    expect(RouterConfigSchema.safeParse({ nope: 1 }).success).toBe(false)
  })

  test('MachineCatalogueSchema checks a catalogue file by its version', () => {
    const file = {
      version: MACHINE_CATALOGUE_VERSION,
      refreshed_at: '2026-03-01',
      layers: [
        {
          source: 'models.dev',
          observed_at: '2026-03-01',
          models: { 'acme/pro-1': { family: 'acme-pro' } },
        },
      ],
    }
    expect(MachineCatalogueSchema.safeParse(file).success).toBe(true)
    expect(MachineCatalogueSchema.safeParse({ ...file, version: 99 }).success).toBe(false)
  })
})

describe('what a refresh moved', () => {
  const grown: CatalogueLayer = {
    source: 'models.dev',
    observed_at: '2026-04-01',
    models: {
      'acme/pro-2': { family: 'acme-pro', traits: ['agent'], release_date: '2026-03-15' },
      'acme/odd-1': { family: 'acme-odd', traits: ['agent'], release_date: '2026-03-15' },
    },
  }
  const before = queryCatalogue(layerCatalogue([base]), policy)
  const after = queryCatalogue(layerCatalogue([base, grown]), policy)

  test('tierTable lists the model each tool is handed for each tier', () => {
    expect(tierTable(before)).toEqual({ 'runner/fast': 'mini-1', 'runner/max': 'pro-1' })
  })

  test('unclassifiedFamilies lists agent families no rule places', () => {
    expect(unclassifiedFamilies(after)).toEqual([
      { family: 'acme/acme-odd', models: ['acme/odd-1'] },
    ])
  })

  test('diffCatalogues reports new models, tier moves and new gaps', () => {
    const diff = diffCatalogues(before, after)
    expect(diff.newModels).toEqual(['acme/odd-1', 'acme/pro-2'])
    expect(diff.goneModels).toEqual([])
    expect(diff.tierMoves).toEqual([{ key: 'runner/max', from: 'pro-1', to: 'pro-2' }])
    expect(diff.newlyUnclassified.map((f) => f.family)).toEqual(['acme/acme-odd'])
  })
})

describe('models.dev rows', () => {
  const api = {
    acme: {
      models: {
        'pro-2': {
          id: 'pro-2',
          family: 'acme-pro',
          release_date: '2026-03-15',
          tool_call: true,
          reasoning: true,
          limit: { context: 1_000_000 },
        },
      },
    },
  }

  test('MODELS_DEV_URL is where the catalogue is published', () => {
    expect(MODELS_DEV_URL).toBe('https://models.dev/api.json')
  })

  test('modelsDevRow maps one models.dev model to a catalogue row', () => {
    const row = modelsDevRow(api.acme.models['pro-2'])
    expect(row).toMatchObject({
      family: 'acme-pro',
      release_date: '2026-03-15',
      context: { max: 1_000_000 },
      status: 'current',
    })
    expect(row.traits).toEqual(['agent', 'reasoning', 'long-context'])
  })

  test('modelsDevRows maps a whole api.json for the providers the catalogue knows', () => {
    const result = modelsDevRows(api, base.providers ?? {}, {}, '2026-06-01')
    expect(Object.keys(result.models)).toEqual(['acme/pro-2'])
    expect(result.unknownProviders).toEqual([])
    expect(result.rejected).toEqual([])
  })

  test('modelsDevRows refuses a release date in the future', () => {
    const early = modelsDevRows(api, base.providers ?? {}, {}, '2026-01-01')
    expect(early.models).toEqual({})
    expect(early.rejected[0]).toMatchObject({ key: 'acme/pro-2' })
  })
})
