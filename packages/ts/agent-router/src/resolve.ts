import type { CatalogueQuery } from './catalogue/query.ts'
import { adjustEffort, type EffortAdjustment } from './effort.ts'
import { formatRef, isTier, isWildcard, type Ref, type Tier } from './ref.ts'
import { err, ok, type Result } from '@osdlc/result'
import { checkRef, type Validity, type ValidityErrorCode } from './validity.ts'

/**
 * A reference resolved against the catalogue: the tool, the concrete model (a tier made concrete),
 * the effort to run with, and the catalogue check that rode along.
 */
export type Resolved = {
  tool: string
  model: string | undefined
  /** The effort to run with: the one asked for, or the level `effortAdjusted` moved it to. */
  effort: string | undefined
  /** Set when the asked-for effort is not accepted and moved one step (`adjustEffort`). */
  effortAdjusted?: EffortAdjustment
  /** True when an effort was given but the catalogue declares no levels to check it against. */
  effortUnchecked: boolean
  /**
   * The context size in tokens the entry runs with: its own `[ctx=]` (`max`
   * made concrete) or the profile's `context:`, whichever is larger. Set by the
   * profile walk (`checkContext`), never by `resolveRef`.
   */
  context?: number
  /** True when a context was asked for but the catalogue knows no size for the model. */
  contextUnchecked: boolean
  /** `formatRef` of the original ref, with the effort as asked for. */
  text: string
  /** How the model was found; a tier `router.pins` set is `pinned`. */
  from:
    | { kind: 'tier'; tier: Tier; pinned?: true }
    | { kind: 'name'; name: string }
    | { kind: 'default' }
  /** The catalogue check of the reference: `ok`, a `warning` to surface, or a `skip` (the entry is passed over). */
  check: Exclude<Validity, { kind: 'error' }>
}

/**
 * Why a reference did not resolve: a wildcard (only a profile walk expands those), an unsupported
 * effort, or any other {@link ValidityErrorCode} from the catalogue check.
 */
export type ResolveError =
  /** A wildcard names no one tool: only a profile walk expands it (`expandWildcard`, over `expandChain`). */
  | { kind: 'wildcard'; tool: string; model: string | undefined; message: string }
  | {
      kind: 'unsupported-effort'
      tool: string
      model: string | undefined
      effort: string
      supported: readonly string[]
      message: string
    }
  | {
      kind: Exclude<ValidityErrorCode, 'unsupported-effort'>
      tool: string
      model: string | undefined
      message: string
      /** The nearest valid reference, when the catalogue knows one. */
      hint?: string
    }

/** What a reference resolves against. */
export type ResolveContext = {
  /** The model catalogue: tiers map through it and every reference is checked against it (`checkRef`). */
  catalogue: CatalogueQuery
  /** A closed set of tool ids; a reference to any other tool is an `unknown-tool` error. */
  knownTools?: readonly string[]
  /** `router.strict`: an unknown model is an error. */
  strict?: boolean
}

/**
 * Resolve a ref against the catalogue. The reference is checked first
 * (`checkRef`): an error (an unknown tool, a tier the tool has no model for,
 * an effort more than one step from any it accepts, a model it cannot run)
 * fails the resolve, and a warning or skip rides on `check`. Then a tier maps
 * to the tool's model for it (`tierModel`, a pin included), and an effort one
 * step off moves to the accepted level, recorded on `effortAdjusted`. A
 * wildcard is an error here: the profile walk expands it first. Qualifiers
 * ride on `text`; the walk applies them.
 */
export function resolveRef(ref: Ref, ctx: ResolveContext): Result<Resolved, ResolveError> {
  if (isWildcard(ref)) {
    return err({
      kind: 'wildcard',
      tool: ref.tool,
      model: ref.model,
      message: `'${formatRef(ref)}' names every tool; only a profile walk expands it`,
    })
  }
  const { catalogue } = ctx
  const check = checkRef(ref, catalogue, {
    ...(ctx.strict !== undefined ? { strict: ctx.strict } : {}),
    ...(ctx.knownTools !== undefined ? { knownTools: ctx.knownTools } : {}),
  })
  if (check.kind === 'error') {
    const base = { tool: ref.tool, model: ref.model, message: check.message }
    return check.code === 'unsupported-effort'
      ? err({ kind: check.code, ...base, effort: ref.effort ?? '', supported: check.efforts ?? [] })
      : err({
          kind: check.code,
          ...base,
          ...(check.hint !== undefined ? { hint: check.hint } : {}),
        })
  }

  let model: string | undefined
  let from: Resolved['from'] = { kind: 'default' }
  if (ref.model !== undefined && isTier(ref.model)) {
    const tier = ref.model
    // `checkRef` passed, so the tool has a model for the tier.
    model = catalogue.tierModel(ref.tool, tier)
    from = { kind: 'tier', tier, ...(catalogue.pinned(ref.tool, tier) ? { pinned: true } : {}) }
  } else if (ref.model !== undefined) {
    model = ref.model
    from = { kind: 'name', name: ref.model }
  }
  const efforts = catalogue.effortsFor(ref.tool, model)
  // `checkRef` passed, so a declared set accepts the effort or a neighbour of it.
  const moved =
    ref.effort !== undefined && efforts !== undefined
      ? adjustEffort(ref.effort, efforts)
      : undefined
  return ok({
    tool: ref.tool,
    model,
    effort: moved?.effort ?? ref.effort,
    ...(moved?.adjusted !== undefined ? { effortAdjusted: moved.adjusted } : {}),
    effortUnchecked: ref.effort !== undefined && efforts === undefined,
    contextUnchecked: false,
    text: formatRef(ref),
    from,
    check,
  })
}
