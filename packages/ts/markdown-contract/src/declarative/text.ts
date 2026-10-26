/**
 * Compiles the YAML `requires:` and `forbids:` keys of a `*.contract.yaml` into the text check
 * builders (`requires`, `forbids` and `textRule` in `../core/text-constraints.ts`). Mistakes in
 * the YAML are rejected here, at compile time, instead of showing up as confusing findings.
 *
 * A `requires:` or `forbids:` value is a list of entries. Each entry must have exactly one of
 * `pattern` (a literal) or `regex` (a source), and may have `normalize`, `ignoreCase`, `min`,
 * `max`, `id`, `note` and `level`. An unknown key, a missing or doubled `pattern`/`regex`, or a
 * value of the wrong type is a `DeclarativeError`. Two more checks apply:
 *
 *   - Duplicates: two entries in one list with the same search text, `normalize` and
 *     `ignoreCase` are rejected, because they would get the same finding id. Two `regex` entries
 *     with the same source are duplicates.
 *   - Contradictions: a `requires` and a `forbids` entry with the same literal `pattern` in one
 *     scope are rejected. Only literals are compared. Overlapping regexes are not detected.
 *   - Count bounds: the code builders' check (`countBoundProblem`) runs here too, so a
 *     `requires` whose `max` means absence, or a `forbids` with a negative `max`, is rejected
 *     the same way in YAML and in code.
 *
 * A section's keys compile to section `Rule`s (`requires(...)` then `forbids(...)`, the order
 * code would list them). The body's keys compile to one `textRule(...)` `DocRule`. The findings
 * are the same as from the code builders: same ids, levels, positions and messages.
 */

import type { TextMatchSpec } from '../core/text-constraints.js'
import { forbids, requires, textRule } from '../core/text-constraints.js'
import type { TextKind } from '../core/text-match.js'
import { countBoundProblem, patternKey } from '../core/text-match.js'
import type { DocRule, Rule } from '../core/types.js'
import { DeclarativeError } from './errors.js'

/** The allowed keys of an entry. Any other key is a `DeclarativeError`. */
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

/** The scalar entry fields and the `typeof` each must have. */
const SCALAR_SPEC_FIELDS = [
  ['normalize', 'boolean'],
  ['ignoreCase', 'boolean'],
  ['min', 'number'],
  ['max', 'number'],
  ['id', 'string'],
  ['note', 'string'],
] as const

/** Checks and compiles one entry. */
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

/** Throws on any key not in `SPEC_KEYS`. */
function assertKnownSpecKeys(raw: Record<string, unknown>, path: string): void {
  for (const key of Object.keys(raw)) {
    if (!SPEC_KEYS.has(key)) {
      throw new DeclarativeError(
        `${path}: unknown match-spec key '${key}' (allowed: ${[...SPEC_KEYS].join(', ')})`,
      )
    }
  }
}

/** Copies `pattern` or `regex` onto `spec`. Exactly one must be present. */
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
    // Compile it now, so a bad source fails when the contract loads, naming the key, and not as
    // a raw SyntaxError on the first document.
    try {
      RegExp(raw.regex, 'g')
    } catch (err) {
      throw new DeclarativeError(
        `${path}.regex is not a valid regular expression: ${(err as Error).message}`,
      )
    }
    spec.regex = raw.regex
  }
}

/** Copies each scalar field that is present onto `spec`, after checking its type. */
function assignScalarFields(raw: Record<string, unknown>, spec: TextMatchSpec, path: string): void {
  for (const [key, type] of SCALAR_SPEC_FIELDS) {
    if (key in raw) {
      const value = raw[key]
      if (typeof value !== type) throw new DeclarativeError(`${path}.${key} must be a ${type}`)
      ;(spec as Record<string, unknown>)[key] = value
    }
  }
}

/** Checks and copies `level` (`error` or `warn`). */
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
 * Throws the code builders' count-bound check (`countBoundProblem`) as a `DeclarativeError` that
 * names the entry, so YAML and code refuse the same entries and the builder's
 * `ContractBuildError` never fires for YAML.
 */
function assertCountBound(spec: TextMatchSpec, kind: TextKind, path: string): void {
  const problem = countBoundProblem(kind, spec)
  if (problem) throw new DeclarativeError(`${path}: ${problem.message}`)
}

/** Compiles a `requires` or `forbids` list. Throws on a duplicate entry. */
function compileMatchSpecs(raw: unknown, kind: TextKind, path: string): TextMatchSpec[] {
  if (!Array.isArray(raw)) {
    throw new DeclarativeError(`${path}: ${kind} must be a list of match specs`)
  }
  const specs = raw.map((entry, i) => compileMatchSpec(entry, kind, `${path}[${i}]`))
  const seen = new Map<string, number>()
  specs.forEach((spec, i) => {
    const key = patternKey(spec)
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

/** A scope's compiled `requires` and `forbids` lists. Either may be empty. */
interface ScopeTextSpecs {
  requires: TextMatchSpec[]
  forbids: TextMatchSpec[]
}

/** True when the node has a `requires` or `forbids` key. */
export function hasTextKeys(node: Record<string, unknown>): boolean {
  return 'requires' in node || 'forbids' in node
}

/**
 * Compiles one scope's `requires` and `forbids` lists. Throws when a `requires` and a `forbids`
 * entry have the same literal `pattern` in this scope, since both cannot pass. Regexes are not
 * compared. `scopeLabel` names the scope in the error.
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

  const literalId = (spec: TextMatchSpec): string | undefined =>
    spec.regex === undefined ? patternKey(spec) : undefined
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
 * The section rules for a section's `requires` and `forbids`: `requires(...)` then
 * `forbids(...)`, the same order as `rules: [requires(...), forbids(...)]` in code. Empty when
 * the section has neither key, or only empty lists.
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
 * One `textRule({ requires, forbids })` document rule for the body's `requires` and `forbids`.
 * `undefined` when both are absent or empty.
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
