import { EFFORT_LEVELS, type EffortLevel } from '@osdlc/agent-call/models'
import { formatSize, MAX_SIZE, readSize } from './context.ts'
import { deepFreeze } from './freeze.ts'
import { err, ok, type Result } from '@osdlc/result'

/**
 * A model tier, a capability class a reference can name in place of a model: `fast`, `standard` or
 * `max`.
 */
export type Tier = 'fast' | 'standard' | 'max'

/** Every {@link Tier}, from the least to the most capable. */
export const TIERS: readonly Tier[] = deepFreeze(['fast', 'standard', 'max'])

/** Whether `s` is one of the {@link TIERS}. */
export function isTier(s: string): s is Tier {
  return (TIERS as readonly string[]).includes(s)
}

/** The model traits of the catalogue (`Trait`), which a qualifier filters on. */
export const TRAITS = deepFreeze([
  'local',
  'agent',
  'embedding',
  'reasoning',
  'long-context',
  'vision',
  'image-out',
] as const)

/**
 * A model trait, one of {@link TRAITS}. A qualifier on a tier or wildcard reference filters to the
 * models that carry it.
 */
export type Trait = (typeof TRAITS)[number]

function isTrait(s: string): s is Trait {
  return (TRAITS as readonly string[]).includes(s)
}

/** The wildcard tool `*`: every tool, for one tier. Allowed in profile entries only. */
export const WILDCARD = '*'

/**
 * The `[...]` group of a reference: `ctx` asks for at least that many tokens of
 * context (`max`: the largest the model offers); `traits` filter a tier or a
 * wildcard to the models that carry every one.
 */
export type Qualifiers = { ctx?: number | 'max'; traits: Trait[] }

/**
 * A parsed `tool/model[qualifiers]@effort` reference. Only `tool` is required;
 * `qualifiers` is present only when the reference has a `[...]` group.
 */
export type Ref = { tool: string; model?: string; qualifiers?: Qualifiers; effort?: string }

/** Why a reference failed to parse; {@link RefParseError} carries one. */
export type RefParseErrorKind =
  | 'empty-ref'
  | 'empty-tool'
  | 'invalid-tool'
  | 'empty-model'
  | 'empty-effort'
  /** An effort that is not one of agent-call's `EFFORT_LEVELS` (`@hgih`). */
  | 'unknown-effort'
  /** A model that starts with `-` (a CLI would read it as a flag) or holds a control or invisible character. */
  | 'invalid-model'
  | 'whitespace'
  /** The input is not a string. */
  | 'not-a-string'
  | 'invalid-qualifiers'
  | 'duplicate-qualifier'
  /** A tool's own bracket (`opus[1m]`, `[context=1m]`); the message gives the `[ctx=...]` form. */
  | 'native-bracket'
  /** A trait on a named model or the tool default: only tiers and wildcards filter. */
  | 'traits-need-tier'
  /** `*` without a tier, or with a model name. */
  | 'wildcard-needs-tier'

/**
 * A reference that did not parse: the `kind` of failure, the offending `text`, and a `message`
 * that quotes it.
 */
export type RefParseError = {
  kind: RefParseErrorKind
  text: string
  message: string
}

/** Whether a ref names every tool: the wildcard tool `*` with a tier. */
export function isWildcard(ref: Ref): boolean {
  return ref.tool === WILDCARD
}

/** Whether a ref's model is a tier word, a concrete name, or absent. */
export function modelKind(ref: Ref): 'tier' | 'name' | undefined {
  if (ref.model === undefined) return undefined
  return isTier(ref.model) ? 'tier' : 'name'
}

/** The shape of a tool id: a lower-case letter, then lower-case letters, digits and hyphens. */
export const TOOL_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/** Whether `s` is a valid tool id, that is, matches {@link TOOL_ID_PATTERN}. */
export function isToolId(s: string): boolean {
  return TOOL_ID_PATTERN.test(s)
}

/** Whether `effort` is one of agent-call's `EFFORT_LEVELS`, the only levels a launcher passes. */
export function isEffortLevel(effort: string): effort is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(effort)
}

/** The message for an effort off `EFFORT_LEVELS`. */
export function unknownEffortMessage(effort: string): string {
  return `effort '${effort}' is not a level (levels: ${EFFORT_LEVELS.join(', ')})`
}

/** Whitespace, control (`Cc`), format (`Cf`: zero-width, bidi) and separator (`Z`) characters. */
const INVISIBLE = /[\s\p{Cc}\p{Cf}\p{Z}]/u

/**
 * Why `model` may not be handed to a tool as its model string, or `undefined`
 * when it may: it (or a `/`-separated part of it, which a launch mode hands on
 * alone) starts with `-`, so a CLI would read it as a flag, or it holds
 * whitespace or a control, format (zero-width, bidi) or separator character.
 * Any other punctuation passes, as local tags use it (`qwen3:4b`). Stricter than
 * `NATIVE_NAME_PATTERN` on one point: that pattern refuses only a leading `-`, not a
 * part after a `/` that starts with one. `router.pins` values follow this rule too.
 */
export function modelProblem(model: string): string | undefined {
  if (model.startsWith('-') || model.includes('/-')) {
    return "model must not start with '-', nor have a part after '/' that does"
  }
  if (INVISIBLE.test(model)) {
    return 'model holds whitespace, a control character or an invisible character'
  }
  return undefined
}

function fail(
  kind: RefParseErrorKind,
  text: string,
  message: string,
): { ok: false; error: RefParseError } {
  return err({ kind, text, message: `${message}: ${JSON.stringify(text)}` })
}

function parseQualifiers(text: string, group: string): Result<Qualifiers, RefParseError> {
  const q: Qualifiers = { traits: [] }
  for (const item of group.split(',')) {
    if (item === '') return fail('invalid-qualifiers', text, 'empty qualifier')
    const eq = item.indexOf('=')
    if (eq < 0) {
      if (/^[0-9]+[a-z]*$/.test(item)) {
        return fail(
          'native-bracket',
          text,
          `a context size is written [ctx=${item}], not a tool's own [${item}]`,
        )
      }
      if (!isTrait(item)) {
        return fail(
          'invalid-qualifiers',
          text,
          `unknown trait '${item}'; known: ${TRAITS.join(', ')}`,
        )
      }
      if (q.traits.includes(item)) {
        return fail('duplicate-qualifier', text, `trait '${item}' appears twice`)
      }
      q.traits.push(item)
      continue
    }
    const key = item.slice(0, eq)
    const value = item.slice(eq + 1)
    if (key === 'context') {
      return fail(
        'native-bracket',
        text,
        `a context size is written [ctx=${value}], not a tool's own [context=${value}]`,
      )
    }
    if (key !== 'ctx') {
      return fail('invalid-qualifiers', text, `unknown qualifier '${key}'; the only key is ctx`)
    }
    if (q.ctx !== undefined) return fail('duplicate-qualifier', text, "'ctx' appears twice")
    const size = value === 'max' ? ok('max' as const) : readSize(value)
    if (!size.ok) {
      return fail(
        'invalid-qualifiers',
        text,
        size.error === 'too-large'
          ? `ctx=${value} is above the largest size, ${MAX_SIZE} tokens`
          : `ctx must be digits plus k or m, or max; got '${value}'`,
      )
    }
    q.ctx = size.value
  }
  q.traits.sort()
  return ok(q)
}

/**
 * Parse a `tool/model[qualifiers]@effort` reference; only the tool is required. The effort follows
 * the last `@` that comes after the last `]`, a trailing `[...]` group holds the qualifiers, and
 * the tool is whatever precedes the first `/`.
 *
 * The model is passed through unchanged. It may itself contain `/` and `:`, and holds an `@` only
 * when an effort follows and there are no qualifiers (`foo@v1@high`). The tool must match {@link
 * TOOL_ID_PATTERN}, or be the wildcard `*` with a tier. Qualifiers are `ctx=<size>` and trait
 * names, each at most once; traits need a tier or a wildcard. A tool's own bracket (`opus[1m]`,
 * `[context=1m]`) is an error that names the `[ctx=...]` form. Failures are returned as a {@link
 * RefParseError}, never thrown.
 *
 * The model is refused when a tool could misread it ({@link modelProblem}: a leading `-`,
 * whitespace, a control or invisible character) as `invalid-model`. The effort must be one of
 * `EFFORT_LEVELS` (`unknown-effort`). Input that is not a string is a `not-a-string` error.
 */
export function parseRef(text: unknown): Result<Ref, RefParseError> {
  if (typeof text !== 'string') {
    const got = text === null ? 'null' : Array.isArray(text) ? 'an array' : typeof text
    return err({
      kind: 'not-a-string',
      // An object may have no `toString` (`Object.create(null)`), so only a primitive is printed.
      text: typeof text === 'object' || typeof text === 'function' ? got : String(text),
      message: `a model reference must be a string; got ${got}`,
    })
  }
  if (text === '') return fail('empty-ref', text, 'empty model reference')
  if (/\s/.test(text)) return fail('whitespace', text, 'model reference contains whitespace')

  const close = text.lastIndexOf(']')
  const at = text.lastIndexOf('@')
  const hasEffort = at > close
  const body = hasEffort ? text.slice(0, at) : text
  const effort = hasEffort ? text.slice(at + 1) : undefined
  if (effort === '') return fail('empty-effort', text, "empty effort after '@'")

  let head = body
  let qualifiers: Qualifiers | undefined
  if (body.endsWith(']')) {
    const open = body.lastIndexOf('[')
    if (open < 0) return fail('invalid-qualifiers', text, "']' without '['")
    const group = body.slice(open + 1, -1)
    if (group === '') return fail('invalid-qualifiers', text, 'empty qualifiers')
    const parsed = parseQualifiers(text, group)
    if (!parsed.ok) return parsed
    qualifiers = parsed.value
    head = body.slice(0, open)
  }
  if (/[[\]]/.test(head)) {
    return fail('invalid-qualifiers', text, "qualifiers are one trailing '[...]' group")
  }
  if (qualifiers !== undefined && head.includes('@')) {
    return fail('invalid-qualifiers', text, "qualifiers go before '@effort'")
  }

  const slash = head.indexOf('/')
  const tool = slash >= 0 ? head.slice(0, slash) : head
  const model = slash >= 0 ? head.slice(slash + 1) : undefined
  if (tool === '') return fail('empty-tool', text, 'empty tool')
  if (tool !== WILDCARD && !isToolId(tool)) {
    return fail('invalid-tool', text, `tool must match ${TOOL_ID_PATTERN.source} or be '*'`)
  }
  if (model === '') return fail('empty-model', text, "empty model after '/'")
  const badModel = model === undefined ? undefined : modelProblem(model)
  if (badModel !== undefined) return fail('invalid-model', text, badModel)
  const tier = model !== undefined && isTier(model)
  if (tool === WILDCARD && !tier) {
    return fail(
      'wildcard-needs-tier',
      text,
      `'*' needs a tier (${TIERS.join(', ')}), as in '*/fast'`,
    )
  }
  if (qualifiers !== undefined && qualifiers.traits.length > 0 && !tier) {
    return fail(
      'traits-need-tier',
      text,
      'traits only filter, so they need a tier or a wildcard (claude/fast[local], */fast[local])',
    )
  }

  if (effort !== undefined && !isEffortLevel(effort)) {
    return fail('unknown-effort', text, unknownEffortMessage(effort))
  }

  const ref: Ref = { tool }
  if (model !== undefined) ref.model = model
  if (qualifiers !== undefined) ref.qualifiers = qualifiers
  if (effort !== undefined) ref.effort = effort
  return ok(ref)
}

/** The `[...]` group in canonical order: `ctx` first, then traits sorted. */
export function formatQualifiers(q: Qualifiers): string {
  const items = [
    ...(q.ctx === undefined ? [] : [`ctx=${q.ctx === 'max' ? 'max' : formatSize(q.ctx)}`]),
    ...[...q.traits].sort(),
  ]
  return items.length > 0 ? `[${items.join(',')}]` : ''
}

/**
 * A reference as text, `tool/model[qualifiers]@effort`, with the qualifiers in the canonical order
 * of {@link formatQualifiers}.
 */
export function formatRef(ref: Ref): string {
  let out = ref.tool
  if (ref.model !== undefined) out += `/${ref.model}`
  if (ref.qualifiers !== undefined) out += formatQualifiers(ref.qualifiers)
  if (ref.effort !== undefined) out += `@${ref.effort}`
  return out
}
