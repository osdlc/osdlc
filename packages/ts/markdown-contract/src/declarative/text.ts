/**
 * The declarative text-constraint compiler — the closed `requires:` / `forbids:` match-spec
 * vocabulary of a `*.contract.yaml`, compiled onto the TS text-predicate builders
 * (`requires` / `forbids` / `textRule` in `../core/text-constraints.ts`). It is
 * the data-authoring twin of `schema.ts`: a finite vocabulary in, the engine's builders out, with
 * the authoring mistakes rejected at compile time rather than surfacing as confusing findings.
 *
 * A `requires:` / `forbids:` value is a LIST of match-spec entries. Each entry is checked against
 * the finite vocabulary — exactly one needle (`pattern` literal | `regex` source), the
 * `normalize` / `ignoreCase` matcher tuning, the `min` / `max` count bound, and the
 * `id` / `note` / `level` finding shapers — so an unknown key, a missing or doubled needle, or a
 * wrong-typed value is a `DeclarativeError`. Two further compile-time consistency checks apply:
 *
 *   - a DUPLICATE — two entries in one list with the same matcher identity (needle + `normalize`
 *     + `ignoreCase`) — is rejected: they would synthesize one finding id. Byte-identical `regex`
 *     sources count as duplicates.
 *   - a CONTRADICTION — a `requires` and a `forbids` entry over the same literal `pattern` at the
 *     same scope, or a single entry whose `max` falls below its effective minimum — is rejected.
 *     Detection is literal-only: no cross-`regex` overlap is analyzed.
 *
 * A section node's keys compile to node-local `Rule`s (`requires(...)` then `forbids(...)`, the
 * order a TS author writes them); the body root's keys compile to one cross-plane `textRule(...)`
 * `DocRule`. Either surface emits findings identical to the equivalent TS builder — same
 * synthesized ids, levels, positions, messages.
 */

import type { TextMatchSpec } from '../core/text-constraints.js'
import { forbids, requires, textRule } from '../core/text-constraints.js'
import type { DocRule, Rule } from '../core/types.js'
import { DeclarativeError } from './errors.js'

/** The kind of scope a match-spec list is authored under — shapes the count-bound floor. */
type TextKind = 'requires' | 'forbids'

/** The closed match-spec vocabulary. Any other key is a `DeclarativeError`. */
const SPEC_KEYS = new Set([
  'pattern',
  'regex',
  'normalize',
  'ignoreCase',
  'min',
  'max',
  'id',
  'note',
  'level',
])

const isMap = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** The plain scalar spec fields validated by a single type check, keyed to the expected typeof. */
const SCALAR_SPEC_FIELDS = [
  ['normalize', 'boolean'],
  ['ignoreCase', 'boolean'],
  ['min', 'number'],
  ['max', 'number'],
  ['id', 'string'],
  ['note', 'string'],
] as const

/** Compile and validate ONE match-spec entry against the closed vocabulary. */
function compileMatchSpec(raw: unknown, kind: TextKind, path: string): TextMatchSpec {
  if (!isMap(raw)) {
    throw new DeclarativeError(`${path}: a match spec must be a mapping (pattern | regex, …)`)
  }
  assertKnownSpecKeys(raw, path)

  const spec: TextMatchSpec = {}
  assignNeedle(raw, spec, path)
  assignScalarFields(raw, spec, path)
  assignLevel(raw, spec, path)
  assertCountBound(spec, kind, path)
  return spec
}

/** Reject any key outside the closed match-spec vocabulary. */
function assertKnownSpecKeys(raw: Record<string, unknown>, path: string): void {
  for (const key of Object.keys(raw)) {
    if (!SPEC_KEYS.has(key)) {
      throw new DeclarativeError(
        `${path}: unknown match-spec key '${key}' (allowed: ${[...SPEC_KEYS].join(', ')})`,
      )
    }
  }
}

/** Resolve the needle onto `spec`: exactly one of `pattern` (a literal) or `regex` (a source). */
function assignNeedle(raw: Record<string, unknown>, spec: TextMatchSpec, path: string): void {
  const hasPattern = 'pattern' in raw
  const hasRegex = 'regex' in raw
  if (hasPattern && hasRegex) {
    throw new DeclarativeError(
      `${path}: a match spec needs exactly one of 'pattern' / 'regex', not both`,
    )
  }
  if (!hasPattern && !hasRegex) {
    throw new DeclarativeError(
      `${path}: a match spec needs one of 'pattern' (a literal) or 'regex' (a source)`,
    )
  }
  if (hasPattern) {
    if (typeof raw.pattern !== 'string')
      throw new DeclarativeError(`${path}.pattern must be a string`)
    spec.pattern = raw.pattern
  }
  if (hasRegex) {
    if (typeof raw.regex !== 'string') throw new DeclarativeError(`${path}.regex must be a string`)
    spec.regex = raw.regex
  }
}

/** Copy each present scalar tuning / shaper field onto `spec`, type-checking it by its expected typeof. */
function assignScalarFields(raw: Record<string, unknown>, spec: TextMatchSpec, path: string): void {
  for (const [key, type] of SCALAR_SPEC_FIELDS) {
    if (key in raw) {
      const value = raw[key]
      if (typeof value !== type) throw new DeclarativeError(`${path}.${key} must be a ${type}`)
      ;(spec as Record<string, unknown>)[key] = value
    }
  }
}

/** Validate and assign the finding `level` override (`error` | `warn`). */
function assignLevel(raw: Record<string, unknown>, spec: TextMatchSpec, path: string): void {
  if ('level' in raw) {
    if (raw.level !== 'error' && raw.level !== 'warn') {
      throw new DeclarativeError(
        `${path}.level must be "error" or "warn" (got ${JSON.stringify(raw.level)})`,
      )
    }
    spec.level = raw.level
  }
}

/**
 * A count bound below its effective floor can never be satisfied — routes absence to
 * `forbids`, not a `requires` with `max: 0`. Caught here as a `DeclarativeError` so the builder's
 * construction-time `ContractBuildError` (`assertRequiresPurity`) never fires.
 */
function assertCountBound(spec: TextMatchSpec, kind: TextKind, path: string): void {
  if (spec.max !== undefined) {
    const floor = kind === 'requires' ? Math.max(spec.min ?? 1, 1) : (spec.min ?? 0)
    if (spec.max < floor) {
      throw new DeclarativeError(
        `${path}: max (${spec.max}) is below the minimum (${floor}) — the count bound can never be satisfied` +
          (kind === 'requires' ? '; use forbids for an absence check' : ''),
      )
    }
  }
}

/**
 * The canonical identity of a spec's MATCHER — the needle plus the flags that change what matches
 * (`normalize` / `ignoreCase`). Two entries with the same identity synthesize one finding id, so
 * they are duplicates; this mirrors `text-match.ts`'s `patternKey`.
 */
function matcherIdentity(spec: TextMatchSpec): string {
  const fold = spec.ignoreCase ? 'i' : ''
  if (spec.regex !== undefined) return `regex|${spec.regex}|${fold}`
  const normalize = spec.normalize ?? true
  const needle = normalize ? (spec.pattern ?? '').trim().replace(/\s+/g, ' ') : (spec.pattern ?? '')
  return `pattern|${normalize ? 'n' : 'x'}|${needle}|${fold}`
}

/** Compile a `requires` / `forbids` LIST, rejecting a duplicate matcher within the list. */
function compileMatchSpecs(raw: unknown, kind: TextKind, path: string): TextMatchSpec[] {
  if (!Array.isArray(raw)) {
    throw new DeclarativeError(`${path}: ${kind} must be a list of match specs`)
  }
  const specs = raw.map((entry, i) => compileMatchSpec(entry, kind, `${path}[${i}]`))
  const seen = new Map<string, number>()
  specs.forEach((spec, i) => {
    const key = matcherIdentity(spec)
    const prev = seen.get(key)
    if (prev !== undefined) {
      throw new DeclarativeError(
        `${path}[${i}]: duplicate match spec — same matcher as ${path}[${prev}] (identical needle / normalize / ignoreCase)`,
      )
    }
    seen.set(key, i)
  })
  return specs
}

/** A scope's compiled `requires` / `forbids` spec lists (either may be empty). */
interface ScopeTextSpecs {
  requires: TextMatchSpec[]
  forbids: TextMatchSpec[]
}

/** Does this node carry either text-constraint key? */
export function hasTextKeys(node: Record<string, unknown>): boolean {
  return 'requires' in node || 'forbids' in node
}

/**
 * Compile one scope's `requires` / `forbids` lists and run the cross-list contradiction check: a
 * `requires` and a `forbids` entry over the SAME literal `pattern` (regex excluded) at one scope
 * is unsatisfiable. `scopeLabel` names the scope in the error.
 */
function compileScopeTextSpecs(
  node: Record<string, unknown>,
  path: string,
  scopeLabel: string,
): ScopeTextSpecs {
  const reqSpecs =
    'requires' in node ? compileMatchSpecs(node.requires, 'requires', `${path}.requires`) : []
  const forbidsSpecs =
    'forbids' in node ? compileMatchSpecs(node.forbids, 'forbids', `${path}.forbids`) : []

  // Literal-only contradiction: regex needles carry no identity here (no overlap analysis).
  const literalId = (spec: TextMatchSpec): string | undefined =>
    spec.regex === undefined ? matcherIdentity(spec) : undefined
  const required = new Set(reqSpecs.map(literalId).filter((k): k is string => k !== undefined))
  for (const spec of forbidsSpecs) {
    const key = literalId(spec)
    if (key !== undefined && required.has(key)) {
      throw new DeclarativeError(
        `${path}: contradiction in ${scopeLabel} — the literal "${spec.pattern}" is both required and forbidden`,
      )
    }
  }

  return { requires: reqSpecs, forbids: forbidsSpecs }
}

/**
 * The node-local rules for a section node's `requires` / `forbids` — `requires(...)` then
 * `forbids(...)`, matching the order a TS author writes `rules: [requires(...), forbids(...)]`.
 * Empty when the node carries neither key (or only empty lists).
 */
export function compileSectionTextRules(
  node: Record<string, unknown>,
  path: string,
  scopeLabel: string,
): Rule[] {
  const { requires: reqSpecs, forbids: forbidsSpecs } = compileScopeTextSpecs(
    node,
    path,
    scopeLabel,
  )
  const rules: Rule[] = []
  if (reqSpecs.length > 0) rules.push(requires(reqSpecs))
  if (forbidsSpecs.length > 0) rules.push(forbids(forbidsSpecs))
  return rules
}

/**
 * The single cross-plane `DocRule` for the body root's `requires` / `forbids` — one
 * `textRule({ requires, forbids })`, the document-scoped form. `undefined` when
 * neither key is present, so the caller attaches nothing.
 */
export function compileBodyTextRule(
  node: Record<string, unknown>,
  path = 'body',
): DocRule | undefined {
  const { requires: reqSpecs, forbids: forbidsSpecs } = compileScopeTextSpecs(
    node,
    path,
    'the document',
  )
  if (reqSpecs.length === 0 && forbidsSpecs.length === 0) return undefined
  return textRule({
    ...(reqSpecs.length > 0 ? { requires: reqSpecs } : {}),
    ...(forbidsSpecs.length > 0 ? { forbids: forbidsSpecs } : {}),
  })
}
