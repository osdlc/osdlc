// Validity: every candidate reference is checked against the catalogue before
// availability. Decision D-06 says which failures are errors, skips or warnings.
// An unknown model only warns because the shipped snapshot and the last refresh
// lag new releases, and a name the tool accepts should not be refused for that;
// `router.strict` makes it an error where drift must fail (CI).
// Pure: the catalogue arrives as a value, and machine state (a model missing on
// this machine) is an availability reason, never a result here.
import type { CatalogueQuery } from './catalogue/query.ts'
import type { Model, Sourced } from './catalogue/types.ts'
import { adjustEffort } from './effort.ts'
import { formatRef, isEffortLevel, isTier, unknownEffortMessage, type Ref } from './ref.ts'

/** Impossible everywhere: the profile holding the reference is invalid. */
export type ValidityErrorCode =
  | 'unknown-tool'
  | 'no-tier-entry'
  | 'provider-not-served'
  | 'model-not-offered'
  | 'unsupported-effort'
  /** An effort that is not one of `EFFORT_LEVELS` (`parseRef` refuses it too). */
  | 'unknown-effort'
  /** Only with `strict`: a model the catalogue does not know. */
  | 'unknown-model'

/** The reference stays, and the person should know. */
export type ValidityWarningCode = 'unknown-model' | 'deprecated-model'

/** Impossible here and now: the entry is skipped and traced, and the walk continues. */
export type ValiditySkipCode = 'withdrawn-model'

/**
 * A failed check: the `code`, a `message`, the nearest valid reference as `hint` when the
 * catalogue knows one, and for `unsupported-effort` the `efforts` the tool and model accept.
 */
export type ValidityError = {
  kind: 'error'
  code: ValidityErrorCode
  message: string
  /** The nearest valid reference, when the catalogue knows one (`claude/sonnet` for `codex/sonnet`). */
  hint?: string
  /** For `unsupported-effort`: the levels the tool and model accept. */
  efforts?: readonly string[]
}

/**
 * The outcome of checking a reference against the catalogue: `ok`, a `warning` to surface, a
 * `skip` that passes the entry over, or an `error` that makes the reference invalid everywhere.
 */
export type Validity =
  | { kind: 'ok' }
  | { kind: 'warning'; code: ValidityWarningCode; message: string }
  | { kind: 'skip'; code: ValiditySkipCode; message: string }
  | ValidityError

/**
 * Options for {@link checkRef}: `strict` makes an unknown model an error, and `knownTools` closes
 * the set of tool ids.
 */
export type CheckContext = {
  /** `router.strict`: an unknown model is an error, not a warning. A deprecated one stays a warning. */
  strict?: boolean
  /** A closed set of tool ids; any other tool is `unknown-tool`, and hints name only these. */
  knownTools?: readonly string[]
}

function list(xs: readonly string[]): string {
  return xs.length > 0 ? xs.join(', ') : '(none)'
}

function error(
  code: ValidityErrorCode,
  message: string,
  extra: { hint?: string | undefined; efforts?: readonly string[] } = {},
): ValidityError {
  const out: ValidityError = { kind: 'error', code, message }
  if (extra.hint !== undefined) {
    out.hint = extra.hint
    out.message = `${message}; nearest valid: ${extra.hint}`
  }
  if (extra.efforts !== undefined) out.efforts = extra.efforts
  return out
}

/** The model `name` means anywhere in the catalogue: a key, an id, a model alias, or any tool's alias. */
function lookupModel(catalogue: CatalogueQuery, name: string): Sourced<Model> | undefined {
  const models = catalogue.catalogue.models
  if (Object.hasOwn(models, name)) return models[name]
  const all = Object.values(models)
  const hit = all.find((m) => m.id === name) ?? all.find((m) => m.aliases?.includes(name) === true)
  if (hit !== undefined) return hit
  for (const tool of catalogue.tools()) {
    const key = tool.aliases?.[name]
    if (key !== undefined && Object.hasOwn(models, key)) return models[key]
  }
  return undefined
}

function servesProvider(catalogue: CatalogueQuery, tool: string, provider: string): boolean {
  return (catalogue.tool(tool)?.serves ?? []).some(
    (s) => (typeof s === 'string' ? s : s.provider) === provider,
  )
}

/** The first tool (in `knownTools` order, else catalogue order) that offers `name`, as a reference. */
function nearest(
  catalogue: CatalogueQuery,
  name: string,
  effort: string | undefined,
  ctx: CheckContext,
): string | undefined {
  const tools = ctx.knownTools ?? catalogue.knownTools()
  for (const tool of tools) {
    if (catalogue.findModel(tool, name) === undefined) continue
    const efforts = catalogue.effortsFor(tool, name)
    const keep = effort !== undefined && efforts !== undefined && accepts(efforts, effort)
    return formatRef({ tool, model: name, ...(keep ? { effort } : {}) })
  }
  return undefined
}

/** True when `effort` is in `efforts` or one step from a level in it (`adjustEffort`). */
function accepts(efforts: readonly string[], effort: string): boolean {
  return adjustEffort(effort, efforts) !== undefined
}

function effortError(
  tool: string,
  model: string | undefined,
  effort: string,
  efforts: readonly string[],
): ValidityError {
  const on = `${model === undefined ? '' : ` for model '${model}'`} on '${tool}'`
  return error(
    'unsupported-effort',
    efforts.length === 0
      ? `effort '${effort}' is not supported${on}; it takes no effort`
      : `effort '${effort}' is not supported${on}; supported: ${efforts.join(', ')}`,
    { efforts },
  )
}

/**
 * Check one reference against the catalogue. The result has one of four kinds:
 *
 * - `ok`.
 * - `warning`: the model is unknown to the catalogue, or deprecated. The entry stays.
 * - `skip`: the model is withdrawn. A walk passes over it.
 * - `error`: the reference cannot work anywhere. That is an unknown tool, a
 *   tier the tool has no model for, a tool that does not serve the model's
 *   provider, a known model the tool does not offer, an unknown model under
 *   `strict`, an effort the tool and model do not accept, or an effort that
 *   is not one of `EFFORT_LEVELS` at all (`unknown-effort`, whatever the
 *   catalogue declares).
 *
 * An effort one step from an accepted level on `EFFORT_LEVELS` passes; the
 * resolve moves it (`adjustEffort`). For a model the catalogue does not know,
 * effort is checked against the tool's own levels only, and passes when the
 * tool declares none.
 */
export function checkRef(ref: Ref, catalogue: CatalogueQuery, ctx: CheckContext = {}): Validity {
  const { tool, effort } = ref
  const known = ctx.knownTools ?? catalogue.knownTools()
  if (!known.includes(tool) || catalogue.tool(tool) === undefined) {
    return error('unknown-tool', `unknown tool '${tool}'; known: ${list(known)}`)
  }
  if (effort !== undefined && !isEffortLevel(effort)) {
    return error('unknown-effort', unknownEffortMessage(effort))
  }

  let name = ref.model
  if (name !== undefined && isTier(name)) {
    const mapped = catalogue.tierModel(tool, name)
    if (mapped === undefined) {
      return error('no-tier-entry', `tool '${tool}' has no model for tier '${name}'`)
    }
    name = mapped
  }

  if (name === undefined) {
    const efforts = catalogue.effortsFor(tool)
    if (effort !== undefined && efforts !== undefined && !accepts(efforts, effort)) {
      return effortError(tool, undefined, effort, efforts)
    }
    return { kind: 'ok' }
  }

  const found = catalogue.findModel(tool, name)
  if (found === undefined) {
    const elsewhere = lookupModel(catalogue, name)
    if (elsewhere !== undefined) {
      if (!servesProvider(catalogue, tool, elsewhere.provider)) {
        return error(
          'provider-not-served',
          `'${tool}' does not serve ${elsewhere.provider}, the provider of '${name}'`,
          { hint: nearest(catalogue, name, effort, ctx) },
        )
      }
      return error('model-not-offered', `'${tool}' does not offer ${elsewhere.key}`, {
        hint: nearest(catalogue, name, effort, ctx),
      })
    }
    const slash = name.indexOf('/')
    const provider = slash > 0 ? name.slice(0, slash) : undefined
    if (
      provider !== undefined &&
      Object.hasOwn(catalogue.catalogue.providers, provider) &&
      !servesProvider(catalogue, tool, provider)
    ) {
      return error('provider-not-served', `'${tool}' does not serve ${provider}`)
    }
    const efforts = catalogue.effortsFor(tool)
    if (effort !== undefined && efforts !== undefined && !accepts(efforts, effort)) {
      return effortError(tool, name, effort, efforts)
    }
    return ctx.strict === true
      ? error(
          'unknown-model',
          `model '${name}' is not in the model catalogue for '${tool}', and router.strict refuses unknown models`,
        )
      : {
          kind: 'warning',
          code: 'unknown-model',
          message: `model '${name}' is not in the model catalogue for '${tool}'; it is passed as written`,
        }
  }

  if (effort !== undefined) {
    const efforts = catalogue.effortsFor(tool, name)
    if (efforts !== undefined && !accepts(efforts, effort)) {
      return effortError(tool, name, effort, efforts)
    }
  }
  const { model } = found
  if (model.status === 'withdrawn') {
    return {
      kind: 'skip',
      code: 'withdrawn-model',
      message: `model '${name}' (${model.key}) is withdrawn`,
    }
  }
  if (model.status === 'deprecated') {
    return {
      kind: 'warning',
      code: 'deprecated-model',
      message: `model '${name}' (${model.key}) is deprecated${model.deprecated_on === undefined ? '' : ` since ${model.deprecated_on}`}`,
    }
  }
  return { kind: 'ok' }
}
