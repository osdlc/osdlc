/**
 * Resolves a setting across layers and records which layer each part came
 * from.
 *
 * The layers are env, local, project and default. `local` and `project` can
 * each replace what the layers beneath them resolved to, or wrap it
 * (`prepend`/`append`). {@link resolveLayeredSteps} does this for a
 * list-valued setting, and {@link resolveLayeredValue} for a single value.
 * Both report the source as `{layer, mode}`.
 *
 * This module stands alone. It knows nothing about the config file, the shape
 * of an environment variable, or any config section's step format. A caller
 * supplies `readRaw` (already scoped to one layer and one entry name) and
 * parsed `envSteps`/`defaultSteps`. This module only applies the four layers
 * in order and tags each resulting step with where it came from.
 */

// ---------------------------------------------------------------------------
// Provenance shape
// ---------------------------------------------------------------------------

/**
 * Which layer a resolved step (or value) came from. `'detected'` is for a
 * caller's own fallback derived from the environment, tried after
 * `'project'`/`'local'` and before `'none'`. This module never produces it.
 * It is in the type so a caller can put it on a `StepProvenance` or
 * `ResolvedStep` it builds by hand.
 * @experimental
 */
export type ValueLayer = 'env' | 'local' | 'project' | 'default' | 'detected' | 'none'

/**
 * How a layer contributed a step. `'default'` is only for the base list.
 * `'replace'` is for a layer that supplied a full step list, including `env`,
 * which only replaces. `'prepend'`/`'append'` are for a layer that wrapped
 * what the layers beneath it resolved to.
 * @experimental
 */
export type StepMode = 'default' | 'replace' | 'prepend' | 'append'

/**
 * Where a step came from: the layer and how that layer combined with the one below.
 * @experimental
 */
export interface StepProvenance {
  layer: ValueLayer
  mode: StepMode
}

// ---------------------------------------------------------------------------
// resolveLayeredSteps
// ---------------------------------------------------------------------------

/**
 * One step of a resolved list, with the layer and mode that produced it.
 * @experimental
 */
export interface ResolvedStep<T> {
  step: T
  source: StepProvenance
}

/**
 * One layer's raw entry for a step-list name. `steps` replaces what the layers
 * beneath it resolved to. `prepend`/`append` wrap it instead. The caller's
 * schema decides whether `steps` and `prepend`/`append` may appear together on
 * one entry. This module uses whichever fields are present and does not check
 * the combination. When `steps` is present, it wins.
 * @experimental
 */
export interface RawLayeredSteps<T> {
  steps?: T[]
  prepend?: T[]
  append?: T[]
}

/**
 * Inputs to resolving a step list across the layers: the default steps, one reader per layer and an optional env override.
 * @experimental
 */
export interface ResolveLayeredStepsOptions<T> {
  /**
   * The base list before any layer overrides it. A plain array for a fixed
   * default, or an async function that detects the default. The function is
   * called on every resolve, before the layers apply.
   */
  defaultSteps: T[] | (() => Promise<T[]>)
  /**
   * Reads the raw entry from one layer: `'project'` is the project file,
   * `'local'` its overlay. Called once per layer. Returns `undefined` when that
   * layer has nothing for this entry. The caller supplies it per config
   * section. This module does not know which file or key it reads.
   */
  readRaw: (layer: 'local' | 'project') => RawLayeredSteps<T> | undefined
  /**
   * A parsed full replacement from the env layer, if any. This module does not
   * know the variable's shape. A defined value here wins over every other
   * layer and is never wrapped.
   */
  envSteps?: T[]
}

/**
 * A resolved step list, each step tagged with the layer it came from.
 * @experimental
 */
export interface ResolvedLayeredSteps<T> {
  steps: ResolvedStep<T>[]
}

function tagSteps<T>(steps: readonly T[], source: StepProvenance): ResolvedStep<T>[] {
  return steps.map((step) => ({ step, source }))
}

/**
 * Apply one layer's raw entry onto what the layers beneath it resolved to. An
 * absent entry leaves `resolved` unchanged. `steps` replaces it. `prepend`/
 * `append` wrap it, and a missing `prepend` or `append` adds nothing on that
 * side.
 */
function applyLayer<T>(
  raw: RawLayeredSteps<T> | undefined,
  layer: ValueLayer,
  resolved: ResolvedStep<T>[],
): ResolvedStep<T>[] {
  if (raw === undefined) return resolved
  if (raw.steps !== undefined) return tagSteps(raw.steps, { layer, mode: 'replace' })
  return [
    ...tagSteps(raw.prepend ?? [], { layer, mode: 'prepend' }),
    ...resolved,
    ...tagSteps(raw.append ?? [], { layer, mode: 'append' }),
  ]
}

/**
 * Resolve a step list through the env, local, project and default layers.
 * Project applies first, then local, so a local wrap goes around what project
 * and default produced. A defined `envSteps` replaces the whole result,
 * including any wraps, since env never wraps.
 *
 * `name` identifies the entry being resolved. This function does not use it,
 * because the caller already scoped `readRaw` and `defaultSteps` to one entry.
 * It is kept so both resolvers take `(name, opts)`.
 * @experimental
 */
export async function resolveLayeredSteps<T>(
  _name: string,
  opts: ResolveLayeredStepsOptions<T>,
): Promise<ResolvedLayeredSteps<T>> {
  const base =
    typeof opts.defaultSteps === 'function' ? await opts.defaultSteps() : opts.defaultSteps

  let resolved = tagSteps(base, { layer: 'default', mode: 'default' })
  resolved = applyLayer(opts.readRaw('project'), 'project', resolved)
  resolved = applyLayer(opts.readRaw('local'), 'local', resolved)

  if (opts.envSteps !== undefined) {
    resolved = tagSteps(opts.envSteps, { layer: 'env', mode: 'replace' })
  }

  return { steps: resolved }
}

// ---------------------------------------------------------------------------
// resolveLayeredValue: the single-value case
// ---------------------------------------------------------------------------

/**
 * Inputs to resolving one value across the layers: the default and a reader for each layer.
 * @experimental
 */
export interface ResolveLayeredValueOptions<V> {
  /** The value before any layer overrides it. */
  defaultValue: V
  /**
   * Reads the raw value from one layer: `'project'` is the project file,
   * `'local'` its overlay. Returns `undefined` when that layer sets nothing for
   * this entry. The single-value form of
   * {@link ResolveLayeredStepsOptions.readRaw}: a bare value, since there is
   * nothing to wrap.
   */
  readRaw: (layer: 'local' | 'project') => V | undefined
}

/**
 * A resolved value and the layer that supplied it.
 * @experimental
 */
export interface ResolvedLayeredValue<V> {
  value: V
  layer: 'local' | 'project' | 'default'
}

/**
 * The single-value form of {@link resolveLayeredSteps}: `local` over `project`
 * over `default`, with no `mode` (nothing to wrap) and no `env` layer. `name`
 * is unused, for the same reason as in `resolveLayeredSteps`.
 * @experimental
 */
export function resolveLayeredValue<V>(
  _name: string,
  opts: ResolveLayeredValueOptions<V>,
): ResolvedLayeredValue<V> {
  const fromLocal = opts.readRaw('local')
  if (fromLocal !== undefined) return { value: fromLocal, layer: 'local' }

  const fromProject = opts.readRaw('project')
  if (fromProject !== undefined) return { value: fromProject, layer: 'project' }

  return { value: opts.defaultValue, layer: 'default' }
}
