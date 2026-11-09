// The model catalogue: facts about tools, providers, models and the offerings
// that join them. Plain data, no I/O: the layers arrive as values (the shipped
// snapshot, machine-level layers, the `router:` config block) and are merged by
// `layerCatalogue`.
import type { Trait } from '../ref.ts'

/** Where a fact came from. */
export type Source = 'snapshot' | 'models.dev' | 'config' | `probe:${string}`

/** The layer a fact came from and the date (`YYYY-MM-DD`) it was observed. */
export type Provenance = { source: Source; observed_at: string }

/**
 * A row with the provenance of the layer that last touched it, and per field
 * the layer that set that field (`fields`), so a partial override keeps the
 * snapshot's provenance on the fields it left alone.
 */
export type Sourced<T> = T & Provenance & { fields: Partial<Record<keyof T, Provenance>> }

/**
 * How a tool picks models: `closed` (one vendor's), `curated` (its own list) or `open` (any
 * provider's, named `provider/id`).
 */
export type Openness = 'closed' | 'curated' | 'open'
/** How a tool can run: `headless` (one prompt, no terminal) or `interactive`. */
export type ToolMode = 'headless' | 'interactive'

/**
 * How a tool takes a model, effort or context: a flag (`--model`), a config
 * key (codex `-c model_reasoning_effort=…`), a model suffix (`opus[1m]`), a
 * bracket key (Cursor `model[effort=high]`), or not at all.
 */
export type Takes =
  { via: 'flag' | 'config' | 'suffix' | 'bracket'; name: string } | { via: 'none' }

/** A provider a tool serves; `via` is the launch mode that reaches it, when one is needed. */
export type ServesEntry = string | { provider: string; via: string }

/** The headless launch template of a declared tool: `{prompt}`, `{model}` and `{effort}` are slots. */
export type HeadlessTemplate = { args: string[]; prompt_via: 'argv' | 'stdin' }

/** A curated tool's own listing of one model. */
export type CuratedOffer = {
  /** The model's catalogue key, `provider/id`. */
  model: string
  native_name: string
  efforts?: string[] | undefined
  context?: ContextSizes | undefined
}

/**
 * A coding-agent CLI in the catalogue: the providers it serves, how it takes a model, effort and
 * context, and how it is launched.
 */
export type Tool = {
  id: string
  /**
   * The executable, looked up on `PATH`: the snapshot's for a built-in tool, the tool id for a
   * declared one.
   */
  binary: string
  serves: ServesEntry[]
  openness: Openness
  modes: ToolMode[]
  /** How the tool takes a model. */
  model: Takes
  /** How the tool takes a reasoning effort. */
  effort: Takes
  /** How the tool takes a context size. */
  context: Takes
  /** The levels the tool can pass; absent when the tool has no fixed list. */
  efforts?: string[] | undefined
  /** The tool's own aliases: alias to model key (`opus` to `anthropic/claude-opus-5-5`). */
  aliases?: Record<string, string> | undefined
  /** Hand the tool its alias rather than the model id (native-name rule 1). */
  prefer_alias?: boolean | undefined
  /**
   * The tool calls each provider itself, with that provider's key (`key_env`, or
   * credentials the tool stored for it), rather than through its own sign-in.
   * Availability then needs the key for a cloud model; absent means the tool's
   * own sign-in is enough.
   */
  provider_keys?: boolean | undefined
  /** A curated tool's own model list. */
  offers?: CuratedOffer[] | undefined
  headless?: HeadlessTemplate | undefined
  /** The tool version the row was checked against. */
  checked_against?: string | undefined
  /** Fields taken from documentation, not a run on the day of the snapshot. */
  verify?: string[] | undefined
}

/** The API a provider speaks. */
export type ProviderKind =
  'anthropic' | 'openai' | 'google' | 'ollama' | 'lmstudio' | 'openai-compatible'

/**
 * A model provider: its id, the kind of API it speaks, an optional endpoint and the name of its
 * key variable.
 */
export type Provider = {
  id: string
  kind: ProviderKind
  endpoint?: string | undefined
  /** The name of the environment variable holding the key, never the key. */
  key_env?: string | undefined
}

/**
 * A model trait (`TRAITS`). A wildcard expands to `agent` models, and to
 * image-output ones only when it asks for `image-out`, never to `embedding` ones.
 */
export type { Trait }

/**
 * Context window sizes in tokens: the `default` a tool runs the model with, the model's `max`, and
 * named `variants`.
 */
export type ContextSizes = {
  default?: number | undefined
  max?: number | undefined
  /** Named variants a tool selects, e.g. `1m`. */
  variants?: string[] | undefined
}

/**
 * A model of a provider, keyed `provider/id`, with its family, release date, context sizes, effort
 * levels, cost, traits and lifecycle status.
 */
export type Model = {
  /** `provider/id`. */
  key: string
  /** The id of the provider that serves the model. */
  provider: string
  id: string
  aliases?: string[] | undefined
  /** The model family (`claude-opus`, say), which classifier rules match. */
  family?: string | undefined
  /** The release day, `YYYY-MM-DD`; the newest model heads a tier. */
  release_date?: string | undefined
  context?: ContextSizes | undefined
  efforts?: string[] | undefined
  /** US dollars per million tokens. */
  cost?: { input: number; output: number } | undefined
  /** What the model can do; see {@link Trait}. */
  traits?: Trait[] | undefined
  /** `deprecated` still runs, with a warning; `withdrawn` is skipped (validity, `checkRef`). */
  status: 'current' | 'deprecated' | 'withdrawn'
  deprecated_on?: string | undefined
}

/** One model on one tool: what the tool is given and how it differs from the model. */
export type Offering = Provenance & {
  tool: string
  /** The model's catalogue key, `provider/id`. */
  model: string
  native_name: string
  via?: string | undefined
  efforts?: string[] | undefined
  context?: ContextSizes | undefined
}

/** A `router.offerings` row: adds (or replaces) one offering, or removes one. */
export type OfferingRow = {
  tool: string
  model: string
  native_name?: string | undefined
  via?: string | undefined
  efforts?: string[] | undefined
  context?: ContextSizes | undefined
  remove?: boolean | undefined
}

/** A row as one layer states it: any subset of the fields, plus an optional own date. */
type LayerRow<T> = { [K in keyof Omit<T, 'id' | 'key'>]?: T[K] | undefined } & {
  observed_at?: string | undefined
}
/** A tool row as one layer states it: any subset of the {@link Tool} fields. */
export type ToolRow = LayerRow<Tool>
/** A provider row as one layer states it: any subset of the {@link Provider} fields. */
export type ProviderRow = LayerRow<Provider>
/** A model row as one layer states it: any subset of the {@link Model} fields. */
export type ModelRow = LayerRow<Model>

/** One layer, lowest first in `layerCatalogue`. Plain data: reading a file is the caller's job. */
export type CatalogueLayer = {
  source: Source
  observed_at: string
  tools?: Record<string, ToolRow> | undefined
  providers?: Record<string, ProviderRow> | undefined
  /** Keyed `provider/id`. */
  models?: Record<string, ModelRow> | undefined
  offerings?: OfferingRow[] | undefined
}

/**
 * A merged row that lacks a required field (it is left out), or a reference to
 * a tool, provider or model the catalogue lacks (the row stays).
 */
export type CatalogueProblem = {
  table: 'tools' | 'providers' | 'models' | 'offerings'
  key: string
  message: string
}

/**
 * The merged catalogue: tools, providers and models keyed by id (each with its provenance), the
 * offering rows, and the problems and warnings found while merging.
 */
export type Catalogue = {
  tools: Record<string, Sourced<Tool>>
  providers: Record<string, Sourced<Provider>>
  models: Record<string, Sourced<Model>>
  /** `router.offerings` rows in layer order, each with its layer's provenance. */
  offeringRows: (OfferingRow & Provenance)[]
  problems: CatalogueProblem[]
  /**
   * References worth a look that do not fail the load: a removal row naming a
   * model the catalogue lacks. Under `strict` they are `problems` instead.
   */
  warnings: CatalogueProblem[]
}

/** How `layerCatalogue` judges what it merges. */
export type LayerOptions = {
  /** `router.strict`: a warning is a problem. */
  strict?: boolean | undefined
}
