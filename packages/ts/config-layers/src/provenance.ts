/**
 * Shared layered-resolution primitive: the provenance half of the config library.
 *
 * One generic cascade — env → local → project → default, with `local`/
 * `project` each able to fully REPLACE or WRAP (`prepend`/`append`) whatever
 * the layer beneath them resolved to — backs any list-valued setting (and, through its scalar narrowing,
 * `resolveLayeredValue`, a single-value setting) with one algorithm and one
 * provenance shape, `{layer, mode}`.
 *
 * This module is intentionally standalone: it knows nothing about
 * the config file, an environment variable's shape, or any one config
 * section's step grammar. A caller supplies `readRaw` (already scoped to one
 * layer and one entry name) and an already-parsed `envSteps`/`defaultSteps`;
 * this module only sequences the four layers and tags each resulting step
 * with where it came from.
 */

// ---------------------------------------------------------------------------
// Provenance shape
// ---------------------------------------------------------------------------

/**
 * Which cascade layer a resolved step (or value) came from. `'detected'` is
 * a caller's own addition — a fallback derived from the environment, tried
 * between `'project'`/`'local'` and `'none'`; this module never
 * produces that tag itself, it only needs the value in its own vocabulary so
 * a caller can carry it on a `StepProvenance`/`ResolvedStep` it builds by hand.
 * @experimental
 */
export type ValueLayer = 'env' | 'local' | 'project' | 'default' | 'detected' | 'none'

/**
 * How a layer contributed a step: `'default'` only for the base list itself,
 * `'replace'` for a layer that supplied a full step list outright (including
 * `env`, which only ever replaces), `'prepend'`/`'append'` for a layer that
 * wrapped whatever the layer(s) beneath it resolved to instead of replacing it.
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
 * One layer's raw entry for a step-list name: `steps` fully replaces
 * whatever the layer(s) beneath it resolved to; `prepend`/`append` wrap it
 * instead. A caller's own schema decides whether `steps` and `prepend`/
 * `append` may coexist on one entry — this module trusts whichever fields
 * are present and never validates the combination itself.
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
   * The base list before any layer overrides it. A plain array for a
   * static built-in default, or an async probe run only when the base is
   * actually needed — how a detection heuristic plugs in.
   */
  defaultSteps: T[] | (() => Promise<T[]>)
  /**
   * `'project'` reads the project file, `'local'` its overlay — RAW,
   * one call per layer, `undefined` when that layer names nothing for this
   * entry at all. Supplied per config section by the caller; this module does not know which
   * file or key it came from.
   */
  readRaw: (layer: 'local' | 'project') => RawLayeredSteps<T> | undefined
  /**
   * Already-parsed full replacement from the env layer, if any — this
   * module does not know the variable's shape, only that a
   * defined value here wins outright over every other layer, unwrapped.
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
 * Apply one layer's raw entry onto what the layer(s) beneath it resolved to:
 * absent leaves `resolved` untouched, `steps` fully replaces it, `prepend`/
 * `append` wrap it (an absent `prepend`/`append` on a wrapping entry
 * contributes nothing on that side, not a step).
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
 * Resolve a step list through the shared env → local → project → default
 * cascade. `local`/`project` are applied in that order (project first, then
 * local, so a local wrap wraps whatever project+default already produced —
 * the layer closest to the repo wins outermost); a defined `envSteps`
 * overrides the result of that whole cascade outright, matching-or-wrapping
 * semantics included, since env never wraps.
 *
 * `name` identifies the entry being resolved. It is not used inside this
 * function — `readRaw`/`defaultSteps` are already scoped to one entry by the
 * caller. It is kept so both resolvers take `(name, opts)`.
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
// resolveLayeredValue — the single-value case
// ---------------------------------------------------------------------------

/**
 * Inputs to resolving one value across the layers: the default and a reader for each layer.
 * @experimental
 */
export interface ResolveLayeredValueOptions<V> {
  /** The value before any layer overrides it. */
  defaultValue: V
  /**
   * `'project'` reads the project file, `'local'` its overlay — RAW,
   * one call per layer, `undefined` when that layer sets nothing for this
   * entry. The scalar narrowing of {@link ResolveLayeredStepsOptions.readRaw}:
   * a bare value, since there is nothing to wrap.
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
 * The scalar narrowing of {@link resolveLayeredSteps}: `local` > `project` >
 * `default`, no `mode` (nothing to wrap) and no `env` layer.
 * `name` is unused here for the same reason as `resolveLayeredSteps`'s.
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
