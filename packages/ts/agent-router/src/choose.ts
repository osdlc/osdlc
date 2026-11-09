import type { AuthorRule } from './author-rule.ts'
import { expandChain } from './chains.ts'
import type { CatalogueQuery } from './catalogue/query.ts'
import { formatSize } from './context.ts'
import { effortAdjustedMessage } from './effort.ts'
import { deepFreeze } from './freeze.ts'
import type { Profile } from './profile.ts'
import {
  formatRef,
  isEffortLevel,
  isTier,
  isToolId,
  isWildcard,
  TOOL_ID_PATTERN,
  unknownEffortMessage,
  type Ref,
  type Tier,
  type Trait,
} from './ref.ts'
import { resolveRef, type ResolveContext, type ResolveError, type Resolved } from './resolve.ts'
import type { ValiditySkipCode } from './validity.ts'
import { entryTraitsMiss, expandWildcard, type WildcardSkipReason } from './wildcard.ts'

/**
 * Why an entry is unavailable: its tool is not installed or signed in, over
 * the usage budget, or cooling down after a rate limit; its local runtime is
 * unreachable or lacks the model; the launcher cannot launch it; it is on a
 * tool other than the one a session runs (`other-tool`); or the tool may not
 * run on an untrusted fork's tree (`untrusted-fork`).
 */
export const AVAILABILITY_REASONS = deepFreeze([
  'not-installed',
  'not-signed-in',
  'over-budget',
  'cooling-down',
  'provider-unreachable',
  'model-not-present',
  'not-launchable',
  'other-tool',
  'untrusted-fork',
] as const)
/** One of {@link AVAILABILITY_REASONS}. */
export type AvailabilityReason = (typeof AVAILABILITY_REASONS)[number]

/** A host's answer for one entry: available, or unavailable with a {@link AvailabilityReason}. */
export type Availability =
  | { ok: true }
  | {
      ok: false
      reason: AvailabilityReason
      /** What failed, for the trace (`ollama does not list qwen3:4b`); never a secret's value. */
      detail?: string
    }

/**
 * Every reason the walk passes an entry over: an availability reason, a
 * wildcard candidate's (`not-agent`, `missing-trait`, `unresolved`), a
 * withdrawn model, a context the model cannot reach on its tool
 * (`below-context`), a tier entry's missing trait, a wildcard that expands to
 * nothing (`no-candidate`), and the author rule's step 1 (`author-tool`).
 */
export const PROFILE_SKIP_REASONS = deepFreeze([
  ...AVAILABILITY_REASONS,
  'not-agent',
  'missing-trait',
  'unresolved',
  'withdrawn-model',
  'below-context',
  'no-candidate',
  'author-tool',
] as const satisfies readonly (
  | AvailabilityReason
  | WildcardSkipReason
  | ValiditySkipCode
  | 'below-context'
  | 'no-candidate'
  | 'author-tool'
)[])
/** One of {@link PROFILE_SKIP_REASONS}. */
export type ProfileSkipReason = (typeof PROFILE_SKIP_REASONS)[number]

/** What the entries resolve against (`catalogue`, `knownTools`, `strict`), plus the walk's inputs. */
export type ChooseContext = ResolveContext & {
  /** Asked per entry, with the entry's resolved `context`; it never skips on context itself. */
  isAvailable: (r: Resolved) => Availability
  /**
   * The author rule, passed by a caller whose work has an author (a code review, say). Unset, no
   * entry is set aside for the author.
   */
  authorRule?: AuthorRule
  /** The tool, and model when known, that produced the work under review. */
  author?: { tool: string; model?: string }
  /**
   * Set when the work has an author nobody could establish (no `author`):
   * under `authorRule.notTheAuthor` every entry may be on the author's tool,
   * so step 1 sets every one aside and `ifOnlyAuthorLeft` decides.
   */
  authorUnknown?: boolean
}

/** One reason a profile (or the author) cannot be used. `entry` is the offending text. */
export type ProfileEntryError = {
  entry: string
  message: string
  /** Present when the entry failed to resolve. */
  error?: ResolveError
}

/**
 * An entry the walk passed over, and why. `ref` is the entry's text (a
 * wildcard's candidate, or the wildcard itself when it expands to nothing);
 * `reason` is the code and `detail` what failed, when known; `step` is the
 * author rule's step that passed it over, when one did.
 */
export type ProfileSkip = {
  ref: string
  reason: ProfileSkipReason
  detail?: string
  step?: 1 | 2 | 3
}

const AVAILABILITY: ReadonlySet<string> = new Set(AVAILABILITY_REASONS)

/**
 * A skip's reason as one line: `author's tool`, `unavailable (cooling-down)`
 * or `unavailable (not-launchable: <detail>)` for an availability reason,
 * `below context: <detail>`, `wildcard expands to no candidate`, else the
 * detail (a withdrawn model, a wildcard candidate's), else the code.
 */
export function skipReasonText(s: Pick<ProfileSkip, 'reason' | 'detail'>): string {
  if (s.reason === 'author-tool') return "author's tool"
  if (s.reason === 'no-candidate') return 'wildcard expands to no candidate'
  if (AVAILABILITY.has(s.reason)) {
    return `unavailable (${s.detail === undefined ? s.reason : `${s.reason}: ${s.detail}`})`
  }
  if (s.reason === 'below-context') return `below context: ${s.detail ?? 'too small'}`
  return s.detail ?? s.reason
}

/** A step of the author rule (`chooseFromProfile`). */
export type AuthorStep = 1 | 2 | 3 | 4

/**
 * What {@link chooseFromProfile} decided. `chosen` holds the entry to run; `wait` means stop and
 * try later; `person` hands the work to a person; `none` means nothing was available; `invalid`
 * means the profile holds entries the catalogue refuses. Every kind carries the `skipped` entries,
 * a `trace` with a line per entry considered, and a one-line `summary`.
 */
export type Choice =
  | {
      kind: 'chosen'
      resolved: Resolved
      sameToolAsAuthor: boolean
      /** Set on an author-tool fallback whose model could not be shown to differ from the author's. */
      modelMayMatchAuthor?: true
      /** Set when no entry was usable except cooling ones and the first of those was taken anyway. */
      allCooling?: true
      /**
       * The author rule's step that decided the choice, when the rule applied
       * (`authorRule.notTheAuthor` with an author): 1, an entry off the author's tool; 2,
       * an author-tool entry under `different-model`; 3, the next model in the
       * tier; 4, an author-tool entry whose model may match.
       */
      authorStep?: AuthorStep
      /**
       * The catalogue's warnings about the chosen entry: an unknown or deprecated
       * model, an effort moved one step, a context it cannot check.
       */
      warnings: string[]
      skipped: ProfileSkip[]
      trace: string[]
      summary: string
    }
  | { kind: 'wait'; skipped: ProfileSkip[]; trace: string[]; summary: string }
  | { kind: 'person'; skipped: ProfileSkip[]; trace: string[]; summary: string }
  | { kind: 'none'; skipped: ProfileSkip[]; trace: string[]; summary: string }
  | {
      kind: 'invalid'
      errors: ProfileEntryError[]
      skipped: ProfileSkip[]
      trace: string[]
      summary: string
    }

/** The outcome of comparing an entry's context requirement to the catalogue. */
export type ContextCheck =
  | { kind: 'ok'; context?: number; unchecked: boolean }
  /** `message` says how far the model falls short (`opus offers 200k on claude, below ctx=1m`). */
  | { kind: 'skip'; message: string }
  | { kind: 'error'; message: string }

/**
 * The context sizes of `entry`'s model: on its tool (the offering's size, else
 * the model's) and anywhere (the largest over the model and every offering).
 */
function contextSizes(
  entry: Resolved,
  catalogue: CatalogueQuery,
): { here: number; anywhere: number; key: string } | undefined {
  if (entry.model === undefined) return undefined
  const found = catalogue.findModel(entry.tool, entry.model)
  if (found === undefined) return undefined
  const size = (c: { default?: number | undefined; max?: number | undefined } | undefined) =>
    c?.max ?? c?.default
  const here = size(found.offering.context) ?? size(found.model.context)
  if (here === undefined) return undefined
  const all = [
    here,
    size(found.model.context),
    ...catalogue.offerings.filter((o) => o.model === found.model.key).map((o) => size(o.context)),
  ].filter((n): n is number => n !== undefined)
  return { here, anywhere: Math.max(...all), key: found.model.key }
}

/**
 * Compare an entry's context requirement with the catalogue's sizes. `want` is the entry's own
 * `[ctx=]` and `required` the profile's `context:`, each meaning "at least"; `max` means the
 * model's size on the tool.
 *
 * An entry asking for more than its model offers anywhere is an `error`, a model that offers less
 * than asked on this tool is a `skip`, and a model with no known size passes as `unchecked`.
 */
export function checkContext(
  entry: Resolved,
  want: number | 'max' | undefined,
  required: number | undefined,
  catalogue: CatalogueQuery,
): ContextCheck {
  if (want === undefined && required === undefined) return { kind: 'ok', unchecked: false }
  const floor = Math.max(typeof want === 'number' ? want : 0, required ?? 0)
  const sizes = contextSizes(entry, catalogue)
  if (sizes === undefined) {
    return { kind: 'ok', ...(floor > 0 ? { context: floor } : {}), unchecked: true }
  }
  if (typeof want === 'number' && want > sizes.anywhere) {
    return {
      kind: 'error',
      message: `ctx=${formatSize(want)} is more than ${sizes.key} offers anywhere (${formatSize(sizes.anywhere)})`,
    }
  }
  if (sizes.here < floor) {
    const asked =
      required !== undefined && required >= (typeof want === 'number' ? want : 0)
        ? `the profile's context: ${formatSize(required)}`
        : `ctx=${formatSize(floor)}`
    return {
      kind: 'skip',
      message: `${sizes.key} offers ${formatSize(sizes.here)} on ${entry.tool}, below ${asked}`,
    }
  }
  return { kind: 'ok', context: want === 'max' ? sizes.here : floor, unchecked: false }
}

/**
 * A resolved entry and the trait filter a tier or wildcard entry asked for
 * (`[]` for a named model), which author rule step 3 applies again.
 */
type Filtered = { entry: Resolved; traits: readonly Trait[] }

/** A resolved entry ready for the walk; `skip` says why the walk passes it over. */
type Prepared = Filtered & { skip?: Pick<ProfileSkip, 'reason' | 'detail'> }

/**
 * Resolve every entry of the profile in order, as the walk sees them: a
 * wildcard is expanded into its category chain (`expandWildcard`) and its
 * passed-over candidates and an empty expansion are skips; a tier entry's
 * traits filter it; the context requirement is checked (`checkContext`), and a
 * wildcard candidate that cannot reach its `[ctx=]` is a skip, not an error; a
 * pinned tier is traced. Errors make the profile invalid; warnings are traced
 * and the entry stays.
 */
function prepareEntries(
  profile: Profile,
  ctx: ResolveContext,
): { entries: Prepared[]; errors: ProfileEntryError[]; skipped: ProfileSkip[]; trace: string[] } {
  const entries: Prepared[] = []
  const errors: ProfileEntryError[] = []
  const skipped: ProfileSkip[] = []
  const trace: string[] = []
  const add = (ref: Ref, entry: Resolved): void => {
    const traits =
      ref.model !== undefined && isTier(ref.model) ? (ref.qualifiers?.traits ?? []) : []
    const checked = checkContext(entry, ref.qualifiers?.ctx, profile.context, ctx.catalogue)
    // A wildcard asks for any model that reaches its `[ctx=]`: a candidate that cannot is skipped.
    const context: ContextCheck =
      checked.kind === 'error' && isWildcard(ref)
        ? { kind: 'skip', message: checked.message }
        : checked
    if (context.kind === 'error') {
      errors.push({ entry: entry.text, message: context.message })
      trace.push(`${entry.text}: invalid (${context.message})`)
      return
    }
    if (entry.from.kind === 'tier' && entry.from.pinned === true) {
      trace.push(`${entry.text}: pinned: ${entry.tool}/${entry.from.tier} is ${entry.model}`)
    }
    if (entry.check.kind === 'warning') {
      trace.push(`${entry.text}: warning: ${entry.check.message}`)
    }
    if (entry.effortAdjusted !== undefined) {
      trace.push(`${entry.text}: ${effortAdjustedMessage(entry.effortAdjusted)}`)
    }
    if (entry.effortUnchecked) trace.push(`${entry.text}: warning: ${effortWarning(entry)}`)
    if (context.kind === 'skip') {
      entries.push({ entry, traits, skip: { reason: 'below-context', detail: context.message } })
      return
    }
    const ready: Resolved = {
      ...entry,
      ...(context.context !== undefined ? { context: context.context } : {}),
      contextUnchecked: context.unchecked,
    }
    if (context.unchecked) trace.push(`${entry.text}: warning: ${contextWarning(ready)}`)
    const miss = entryTraitsMiss(ready, traits, ctx.catalogue)
    entries.push(
      miss === undefined
        ? { entry: ready, traits }
        : { entry: ready, traits, skip: { reason: 'missing-trait', detail: miss } },
    )
  }
  for (const ref of profile.order) {
    const text = formatRef(ref)
    if (isWildcard(ref)) {
      if (ref.effort !== undefined && !isEffortLevel(ref.effort)) {
        // No candidate could take it; caught here, not passed over as each one's `unresolved`.
        const message = unknownEffortMessage(ref.effort)
        errors.push({ entry: text, message })
        trace.push(`${text}: invalid (${message})`)
        continue
      }
      const expansion = expandWildcard(ref, ctx)
      for (const s of expansion.skipped) {
        skipped.push({ ref: s.text, reason: s.reason, detail: s.detail })
        trace.push(`${s.text}: skipped: ${s.detail} (from ${text})`)
      }
      if (expansion.entries.length === 0) {
        const skip: ProfileSkip = { ref: text, reason: 'no-candidate' }
        skipped.push(skip)
        trace.push(`${text}: skipped: ${skipReasonText(skip)}`)
        continue
      }
      trace.push(`${text}: expands to ${expansion.entries.map((e) => e.text).join(', ')}`)
      for (const entry of expansion.entries) add(ref, entry)
      continue
    }
    const r = resolveRef(ref, ctx)
    if (r.ok) {
      add(ref, r.value)
    } else {
      errors.push({ entry: text, message: r.error.message, error: r.error })
      trace.push(`${text}: invalid (${r.error.message})`)
    }
  }
  return { entries, errors, skipped, trace }
}

function effortWarning(r: Resolved): string {
  const on = r.model === undefined ? `'${r.tool}'` : `'${r.model}' on '${r.tool}'`
  return `effort '${r.effort}' is not checked: the catalogue declares no effort levels for ${on}`
}

function contextWarning(r: Resolved): string {
  return `context${r.context !== undefined ? ` ${formatSize(r.context)}` : ''} is not checked: the catalogue knows no context size for the model`
}

/**
 * Resolve every entry of the profile (expanding wildcards); returns one error
 * per entry that does not resolve, that the catalogue refuses, or that asks for
 * more context than its model offers anywhere (empty when the profile is
 * usable). Warnings and skips are not errors. Never checks availability.
 */
export function validateProfile(profile: Profile, ctx: ResolveContext): ProfileEntryError[] {
  return prepareEntries(profile, ctx).errors
}

/**
 * The one-entry profile a single reference walks as: a `tool:` binding, or a
 * reference checked on its own.
 */
export function refProfile(ref: Ref): Profile {
  return { order: [ref] }
}

/**
 * The walk's running record: one trace line per entry considered, the
 * structured skips, and the entry each skip of a resolved entry belongs to
 * (`owners`). Two entries can share a text (a wildcard candidate and a plain
 * entry), so a skip is matched to its entry by identity, never by text.
 */
type Walk = { trace: string[]; skipped: ProfileSkip[]; owners: Map<ProfileSkip, Resolved> }

/**
 * Record a skip of `owner` (when it is a resolved entry) and its trace line;
 * an author-rule skip names its step.
 */
function pass(walk: Walk, s: ProfileSkip, owner?: Resolved): void {
  walk.skipped.push(s)
  if (owner !== undefined) walk.owners.set(s, owner)
  const why = skipReasonText(s)
  walk.trace.push(
    s.step === 1
      ? `${s.ref}: skipped: ${why} (author rule step 1: not_the_author)`
      : s.step === 2
        ? `author rule step 2 (different-model): ${s.ref}: skipped: ${why}`
        : s.step === 3
          ? `author rule step 3: ${s.ref}: skipped: ${why}`
          : `${s.ref}: skipped: ${why}`,
  )
}

/** The skip for an unavailable entry: the availability's reason and detail. */
function unavailable(
  ref: string,
  a: Extract<Availability, { ok: false }>,
  step?: 2 | 3,
): ProfileSkip {
  return {
    ref,
    reason: a.reason,
    ...(a.detail !== undefined ? { detail: a.detail } : {}),
    ...(step !== undefined ? { step } : {}),
  }
}

/** A `chosen` result for `entry`; its own earlier skips (set aside, cooling) are dropped from `skipped`. */
function chosen(
  walk: Walk,
  entry: Resolved,
  summary: string,
  flags: {
    sameToolAsAuthor?: boolean
    modelMayMatchAuthor?: boolean
    allCooling?: boolean
    authorStep?: AuthorStep | undefined
  } = {},
): Choice {
  return {
    kind: 'chosen',
    resolved: entry,
    sameToolAsAuthor: flags.sameToolAsAuthor === true,
    ...(flags.modelMayMatchAuthor === true ? { modelMayMatchAuthor: true as const } : {}),
    ...(flags.allCooling === true ? { allCooling: true as const } : {}),
    ...(flags.authorStep !== undefined ? { authorStep: flags.authorStep } : {}),
    warnings: warningsOf(entry),
    skipped: walk.skipped.filter((s) => walk.owners.get(s) !== entry),
    trace: walk.trace,
    summary,
  }
}

function invalid(errors: ProfileEntryError[], walk: Walk): Choice {
  return {
    kind: 'invalid',
    errors,
    skipped: walk.skipped,
    trace: walk.trace,
    summary: `invalid: ${errors.map((e) => `${e.entry}: ${e.message}`).join('; ')}`,
  }
}

function warningsOf(r: Resolved): string[] {
  return [
    ...(r.check.kind === 'warning' ? [r.check.message] : []),
    ...(r.effortAdjusted !== undefined ? [effortAdjustedMessage(r.effortAdjusted)] : []),
    ...(r.effortUnchecked ? [effortWarning(r)] : []),
    ...(r.contextUnchecked ? [contextWarning(r)] : []),
  ]
}

function isCooling(a: Availability): boolean {
  return !a.ok && a.reason === 'cooling-down'
}

/** The first of `cooling`, taken because nothing else is available; `undefined` when none is cooling. */
function takeCooling(
  walk: Walk,
  cooling: readonly Resolved[],
  authorStep: AuthorStep | undefined,
): Choice | undefined {
  const first = cooling[0]
  if (first === undefined) return undefined
  walk.trace.push(`${first.text}: taken: no entry is available and ${cooling.length} cooling down`)
  return chosen(
    walk,
    first,
    `chosen: ${first.text} (all usable entries are cooling down; first one tried anyway)`,
    { allCooling: true, authorStep },
  )
}

/**
 * Walk the profile in order and pick the first usable entry.
 *
 * Every entry is prepared first (`prepareEntries`). Each is resolved and
 * checked against the catalogue, wildcards are expanded, and the context
 * requirement is checked. Each check can end three ways:
 *
 * - An error makes the outcome `invalid`, and nothing is chosen. Errors are an
 *   unknown tool, a reference the catalogue knows is impossible, and a
 *   `[ctx=]` larger than the model offers anywhere.
 * - A warning is traced, and the entry stays. Warnings come from the catalogue,
 *   or from a context that could not be checked.
 * - A skip is traced, and the walk passes over the entry. Skips are a withdrawn
 *   model, a context the model cannot reach on this tool, a tier entry's
 *   missing trait, and a wildcard that expands to nothing.
 *
 * The author rule is the caller's (`ctx.authorRule`), not the profile's. It
 * has four steps, and its trace lines name the step:
 *
 *   1. With `notTheAuthor`, every entry on the author's tool is set aside.
 *      With `authorUnknown` instead of an author, any tool may be the
 *      author's, so every entry is set aside.
 *   2. When no other entry is available and at least one was set aside,
 *      `ifOnlyAuthorLeft` decides. `wait` and `person` apply whether or not
 *      the set-aside entries are available. `different-model` takes the first
 *      available author-tool entry whose explicit model differs from the
 *      author's known model. Two names for one catalogue model do not differ.
 *   3. When no entry differs, look up the tier of the first available
 *      author-tool entry: a tier entry's own, or a named model's catalogue
 *      tier. Take the first model of that tier on the author's tool, in chain
 *      order, that passes the entry's trait filter, differs from the author's
 *      and is available. Never a lower tier.
 *   4. Otherwise take the first available author-tool entry and flag it
 *      `modelMayMatchAuthor`. This happens when the author's model is unknown,
 *      the entry's tier is unknown, or no model of the tier differs. With the
 *      author unknown, `sameToolAsAuthor` stays false: nobody knows the tool.
 *
 * Cooldowns alone never return `none`, `wait` or `person`. When no entry is
 * available but some were only cooling down, the first of those is taken and
 * flagged `allCooling`: under `wait` and `person` the first cooling entry off
 * the author's tool, before the rule waits or hands over. A cooldown is an
 * estimate (the reported reset, else a fixed window). One more attempt costs a
 * failed call; `none` fails the launch.
 *
 * `none` means nothing was available or cooling. Either no entry was set aside
 * for the author rule (a profile whose entries were all skipped included), or
 * `different-model` found no author-tool entry to take.
 *
 * The trace has one line per entry considered, and `summary` holds the closing
 * statement. `skipped` lists every entry passed over, with its reason and the
 * author-rule step that decided it. It never holds the chosen entry. When the
 * author rule applied, a `chosen` result carries the deciding step (`authorStep`).
 */
export function chooseFromProfile(profile: Profile, ctx: ChooseContext): Choice {
  const walk: Walk = { trace: [], skipped: [], owners: new Map() }
  const { trace } = walk
  const author = ctx.author
  const notTheAuthor = ctx.authorRule?.notTheAuthor === true
  // With no author named, an unknown one may be on any tool.
  const unknown = author === undefined && ctx.authorUnknown === true && notTheAuthor
  // Step 1 decides any choice off the author's tool, when the rule applies.
  const offAuthorStep: AuthorStep | undefined = notTheAuthor && author !== undefined ? 1 : undefined

  if (author !== undefined && !isToolId(author.tool)) {
    const message = `author tool must match ${TOOL_ID_PATTERN.source}`
    trace.push(`author ${JSON.stringify(author.tool)}: invalid (${message})`)
    return invalid([{ entry: author.tool, message }], walk)
  }

  const prepared = prepareEntries(profile, ctx)
  trace.push(...prepared.trace)
  walk.skipped.push(...prepared.skipped)
  if (prepared.errors.length > 0) return invalid(prepared.errors, walk)
  if (unknown) trace.push("author unknown: any tool may be the author's (author rule step 1)")

  /** Entries on the author's tool, set aside by step 1, with their trait filters. */
  const setAside: Filtered[] = []
  /** Entries that were usable but for a cooldown, in profile order. */
  const cooling: Resolved[] = []
  for (const { entry, traits, skip } of prepared.entries) {
    if (entry.check.kind === 'skip') {
      pass(walk, { ref: entry.text, reason: entry.check.code, detail: entry.check.message }, entry)
      continue
    }
    if (skip !== undefined) {
      pass(walk, { ref: entry.text, ...skip }, entry)
      continue
    }
    if (unknown || (notTheAuthor && author !== undefined && entry.tool === author.tool)) {
      setAside.push({ entry, traits })
      pass(walk, { ref: entry.text, reason: 'author-tool', step: 1 }, entry)
      continue
    }
    const avail = ctx.isAvailable(entry)
    if (!avail.ok) {
      if (isCooling(avail)) cooling.push(entry)
      pass(walk, unavailable(entry.text, avail), entry)
      continue
    }
    trace.push(`${entry.text}: taken`)
    return chosen(walk, entry, `chosen: ${entry.text}`, { authorStep: offAuthorStep })
  }

  const rule = ctx.authorRule?.ifOnlyAuthorLeft ?? 'different-model'
  if (setAside.length === 0 || rule !== 'different-model') {
    // A cooldown is no reason to stop, wait or ask a person: the first cooling entry off the
    // author's tool is taken. (`different-model` tries the author's tool first, below.)
    const viaCooling = takeCooling(walk, cooling, offAuthorStep)
    if (viaCooling !== undefined) return viaCooling
  }
  if (setAside.length === 0) {
    return { kind: 'none', skipped: walk.skipped, trace, summary: 'none: no entry is usable' }
  }

  const left = unknown
    ? "the author is unknown, so any tool may be the author's"
    : "only the author's tool is left"
  switch (rule) {
    case 'wait':
      trace.push('author rule step 2: if_only_author_left: wait')
      return { kind: 'wait', skipped: walk.skipped, trace, summary: `wait: ${left}` }
    case 'person':
      trace.push('author rule step 2: if_only_author_left: person')
      return { kind: 'person', skipped: walk.skipped, trace, summary: `person: ${left}` }
    case 'different-model':
      return authorFallback(walk, setAside, cooling, { model: author?.model, unknown }, ctx)
  }
}

/**
 * Author rule steps 2 to 4 under `different-model`, over the entries step 1
 * set aside (`setAside`, in profile order). When none of them is available,
 * the first cooling entry is taken: the walk's own first, else the author
 * tool's. An unknown author has no model, so nothing differs and step 4 takes
 * the first available entry.
 */
function authorFallback(
  walk: Walk,
  setAside: readonly Filtered[],
  cooling: readonly Resolved[],
  author: { model: string | undefined; unknown: boolean },
  ctx: ChooseContext,
): Choice {
  const { trace } = walk
  const authorModel = author.model
  // An unknown author's tool is not known to be the entry's.
  const sameToolAsAuthor = !author.unknown
  const mayMatchReason = (e: Resolved): string =>
    author.unknown ? 'author unknown' : modelMayMatchReason(authorModel, e)
  const differs = (e: Resolved): boolean =>
    authorModel !== undefined &&
    e.model !== undefined &&
    !sameModel(e.tool, e.model, authorModel, ctx.catalogue)

  // Step 2: the first available author-tool entry whose model differs.
  let held: (Filtered & { why: string }) | undefined
  const authorCooling: Resolved[] = []
  for (const { entry, traits } of setAside) {
    const avail = ctx.isAvailable(entry)
    if (!avail.ok) {
      if (isCooling(avail)) authorCooling.push(entry)
      pass(walk, unavailable(entry.text, avail, 2), entry)
      continue
    }
    if (differs(entry)) {
      trace.push(
        `author rule step 2 (different-model): ${entry.text}: taken, model differs from the author's`,
      )
      return chosen(walk, entry, `chosen: ${entry.text} (same tool as author, different model)`, {
        sameToolAsAuthor: true,
        authorStep: 2,
      })
    }
    const why = mayMatchReason(entry)
    trace.push(
      `author rule step 2 (different-model): ${entry.text}: available, model may match author (${why})`,
    )
    held ??= { entry, traits, why }
  }

  if (held !== undefined) {
    // Step 3: the next model of the held entry's tier.
    const next =
      authorModel === undefined
        ? undefined
        : nextInTier(held.entry, held.traits, authorModel, ctx, walk)
    if (next !== undefined) {
      return chosen(
        walk,
        next,
        `chosen: ${next.text} (same tool as author, next model in the tier)`,
        { sameToolAsAuthor: true, authorStep: 3 },
      )
    }
    // Step 4: the held entry, flagged.
    trace.push(`author rule step 4: ${held.entry.text}: taken, model may match author`)
    return chosen(
      walk,
      held.entry,
      `chosen: ${held.entry.text} (${author.unknown ? 'author unknown' : 'same tool as author'}, model may match: ${held.why})`,
      { sameToolAsAuthor, modelMayMatchAuthor: true, authorStep: 4 },
    )
  }

  // Nothing available anywhere: a cooldown alone must not return `none`.
  const viaCooling = takeCooling(walk, cooling, 1)
  if (viaCooling !== undefined) return viaCooling
  const first = authorCooling[0]
  if (first === undefined) {
    return {
      kind: 'none',
      skipped: walk.skipped,
      trace,
      summary: 'none: no author-tool fallback is available',
    }
  }
  const mayMatch = !differs(first)
  trace.push(
    `author rule step 2 (different-model): ${first.text}: taken: no entry is available and ${authorCooling.length} cooling down`,
  )
  return chosen(
    walk,
    first,
    `chosen: ${first.text} (${author.unknown ? 'author unknown' : 'same tool as author'}; all usable entries are cooling down${mayMatch ? `; model may match: ${mayMatchReason(first)}` : ''})`,
    { sameToolAsAuthor, allCooling: true, modelMayMatchAuthor: mayMatch, authorStep: 2 },
  )
}

/**
 * Whether `a` and `b` name the same model on `tool`: the same catalogue model
 * (`opus` and `claude-opus-5-5` on claude), else the same text.
 */
function sameModel(tool: string, a: string, b: string, catalogue: CatalogueQuery): boolean {
  if (a === b) return true
  const ka = catalogue.findModel(tool, a)?.model.key
  return ka !== undefined && ka === catalogue.findModel(tool, b)?.model.key
}

/** The tier of `entry`'s model: its tier reference, else its catalogue placement. */
function entryTier(entry: Resolved, catalogue: CatalogueQuery): Tier | undefined {
  if (entry.from.kind === 'tier') return entry.from.tier
  if (entry.model === undefined) return undefined
  const found = catalogue.findModel(entry.tool, entry.model)
  if (found === undefined) return undefined
  const placed = catalogue.tierOf(found.model.key)
  return isTier(placed) ? placed : undefined
}

/**
 * Author rule step 3: the first model of `entry`'s tier on the author's tool,
 * in chain order (`expandChain` over `ctx.catalogue`), that carries the entry's
 * `traits`, differs from the author's and is available. It keeps the entry's
 * requested effort and context.
 * `undefined` (step 4 follows) when the tier is unknown or no such model is
 * available.
 */
function nextInTier(
  entry: Resolved,
  traits: readonly Trait[],
  authorModel: string,
  ctx: ChooseContext,
  walk: Walk,
): Resolved | undefined {
  const { catalogue } = ctx
  const tier = entryTier(entry, catalogue)
  if (tier === undefined) {
    walk.trace.push(`author rule step 3: ${entry.text}: tier unknown`)
    return undefined
  }
  // The effort as asked for: the next model moves it, if it must, from there.
  const effort = entry.effortAdjusted?.requested ?? entry.effort
  for (const c of expandChain(tier, traits, catalogue).entries) {
    if (c.tool !== entry.tool || sameModel(c.tool, c.native_name, authorModel, catalogue)) continue
    const ref: Ref = {
      tool: c.tool,
      model: c.native_name,
      ...(effort !== undefined ? { effort } : {}),
    }
    const r = resolveRef(ref, ctx)
    if (!r.ok || r.value.check.kind === 'skip') continue
    const context = checkContext(r.value, undefined, entry.context, catalogue)
    if (context.kind !== 'ok') continue
    const next: Resolved = {
      ...r.value,
      ...(context.context !== undefined ? { context: context.context } : {}),
      contextUnchecked: context.unchecked,
    }
    const avail = ctx.isAvailable(next)
    if (!avail.ok) {
      pass(walk, unavailable(next.text, avail, 3), next)
      continue
    }
    walk.trace.push(`author rule step 3: ${next.text}: taken, next ${tier} model on ${entry.tool}`)
    return next
  }
  walk.trace.push(`author rule step 3: no other ${tier} model on ${entry.tool} is available`)
  return undefined
}

function modelMayMatchReason(authorModel: string | undefined, entry: Resolved): string {
  return authorModel === undefined
    ? "author's model unknown"
    : entry.model === undefined
      ? 'entry uses the tool default model'
      : "entry's model equals the author's"
}
