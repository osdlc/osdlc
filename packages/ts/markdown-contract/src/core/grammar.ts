/**
 * The contract builders: `contract()`, the body grammar (`sections`, `section`, `optional`,
 * `oneOf`, `gap`) and the rule factories (`rule`, `docRule`). The builders return plain data;
 * `contract()` wires `validate()` and `read()` to the engine.
 */
import { toCamelKey } from './camel.js'
import type {
  BodyOf,
  Contract,
  ContractDef,
  Ctx,
  Doc,
  DocRule,
  DocTree,
  Finding,
  GapSpec,
  LevelOpts,
  NamesTupleOf,
  OneOfSpec,
  OptionalSpec,
  Rule,
  SectionNode,
  SectionOpts,
  SectionSeq,
  SectionSpec,
  SectionValue,
  Spec,
  ValidateCtx,
} from './types.js'
import { read as readEntry, validate as validateEntry } from './validate.js'

/**
 * The error a builder throws for a malformed contract, such as two section names with the same
 * camelCase key. `id` names the check, for example `contract/key-collision`. It is not a
 * finding: it fails when the contract is built, not when a document is checked.
 */
export class ContractBuildError extends Error {
  readonly id: string
  constructor(id: string, message: string) {
    super(message)
    this.name = 'ContractBuildError'
    this.id = id
  }
}

/**
 * Builds a contract for one document type from a frontmatter Zod schema, a body grammar and
 * document rules. The result's `validate()` returns findings; its `read()` returns the typed
 * model or throws `ContractError`.
 *
 * @example
 * ```ts
 * const note = contract({
 *   frontmatter: z.object({ title: z.string() }),
 *   body: sections({ order: 'strict' }, [section('Summary'), section('Details')]),
 * })
 * const { findings } = note.validate(source, { path: 'notes/a.md' })
 * ```
 */
export function contract<F, B>(def: ContractDef<F, B>): Contract<F, B> {
  return {
    validate(input: string | DocTree, ctx: ValidateCtx) {
      return validateEntry<F, B>(def, input, ctx)
    },
    read(source: string, ctx: ValidateCtx): Doc<F, B> {
      return readEntry<F, B>(def, source, ctx)
    },
  } as Contract<F, B>
}

/**
 * Builds a body grammar from level options and an ordered list of specs. The result types the
 * body: each declared section's heading is a key of `doc.body` (see `BodyOf`).
 *
 * @throws {ContractBuildError} When two declared names at this level have the same camelCase key
 *   (`contract/key-collision`).
 */
export function sections<const S extends readonly Spec[]>(
  opts: LevelOpts,
  specs: S,
): SectionSeq<BodyOf<S>> {
  assertNoKeyCollision(specs)
  return { __brand: 'SectionSeq', opts, specs } as SectionSeq<BodyOf<S>>
}

/**
 * Throws `contract/key-collision` when two declared names at one level have the same camelCase
 * key. Each level runs its own check. The spellings of one `oneOf` or `section([...])` are one
 * slot, so only the first spelling of each slot is keyed.
 */
function assertNoKeyCollision(specs: readonly Spec[]): void {
  const keyToName = new Map<string, string>()
  for (const spec of specs) {
    const inner = unwrapInner(spec)
    let primaryName: string | undefined
    if (inner.kind === 'section') primaryName = (inner as SectionSpec).names[0]
    else if (inner.kind === 'oneOf') primaryName = (inner as OneOfSpec).names[0]
    if (primaryName === undefined) continue
    const key = toCamelKey(primaryName)
    if (key === '') continue // no generated key, so nothing to collide with
    const prior = keyToName.get(key)
    if (prior !== undefined && prior !== primaryName) {
      throw new ContractBuildError(
        'contract/key-collision',
        `section names ‘${prior}’ and ‘${primaryName}’ both generate the camelCase key ‘${key}’; generated keys must be unique`,
      )
    }
    keyToName.set(key, primaryName)
  }
}

/** Unwraps `optional(spec)` to the spec inside it. */
function unwrapInner(spec: Spec): SectionSpec | OneOfSpec | GapSpec {
  return spec.kind === 'optional' ? unwrapInner((spec as OptionalSpec).spec) : spec
}

/**
 * Throws `contract/repeat-bounds` when `min` or `max` is set without `repeatable: true`, is not a
 * non-negative integer, or when `min` exceeds `max`.
 */
function assertRepeatBounds(opts: SectionOpts | undefined, label: string): void {
  if (!opts) return
  const { repeatable, min, max } = opts
  if (repeatable !== true) {
    if (min !== undefined || max !== undefined) {
      throw new ContractBuildError(
        'contract/repeat-bounds',
        `section ‘${label}’ declares min/max without ‘repeatable: true’; occurrence bounds apply only to a repeatable slot`,
      )
    }
    return
  }
  if (min !== undefined && (!Number.isInteger(min) || min < 0)) {
    throw new ContractBuildError(
      'contract/repeat-bounds',
      `section ‘${label}’ has a non-integer or negative min ${min}`,
    )
  }
  if (max !== undefined && (!Number.isInteger(max) || max < 0)) {
    throw new ContractBuildError(
      'contract/repeat-bounds',
      `section ‘${label}’ has a non-integer or negative max ${max}`,
    )
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new ContractBuildError(
      'contract/repeat-bounds',
      `section ‘${label}’ has min ${min} greater than max ${max}`,
    )
  }
}

/**
 * Declares a required section by its heading, or by a list of accepted spellings. The options
 * set its content, child sections, rules, anchor and repeat counts. The result's type carries
 * the value the section reads back as (see `SectionValue`).
 *
 * @throws {ContractBuildError} When `min` or `max` is invalid, or set without `repeatable: true`
 *   (`contract/repeat-bounds`).
 */
export function section<
  const Names extends string | readonly string[],
  const O extends SectionOpts = SectionOpts,
>(name: Names, opts?: O): SectionSpec<SectionValue<O>, NamesTupleOf<Names>> {
  const names: string[] = Array.isArray(name) ? [...name] : [name as string]
  assertRepeatBounds(opts, names[0] ?? '')
  const spec: SectionSpec = { kind: 'section', names, ...(opts ? { opts } : {}) }
  return spec as unknown as SectionSpec<SectionValue<O>, NamesTupleOf<Names>>
}

/** Marks a spec as optional: the section may be absent. */
export function optional(spec: Spec): Spec {
  const out: OptionalSpec = { kind: 'optional', spec }
  return out
}

/**
 * Accepts any one of several heading spellings at one position.
 *
 * @throws {ContractBuildError} When `min` or `max` is invalid (`contract/repeat-bounds`).
 */
export function oneOf(names: string[], opts?: SectionOpts): Spec {
  assertRepeatBounds(opts, names[0] ?? '')
  const spec: OneOfSpec = { kind: 'oneOf', names, ...(opts ? { opts } : {}) }
  return spec
}

/** Allows a run of undeclared sections at this position, optionally between `min` and `max` of them. */
export function gap(opts?: { min?: number; max?: number }): Spec {
  const spec: GapSpec = {
    kind: 'gap',
    ...(opts?.min !== undefined ? { min: opts.min } : {}),
    ...(opts?.max !== undefined ? { max: opts.max } : {}),
  }
  return spec
}

/**
 * Makes a named rule for a section. Attach it with `section(name, { rules: [...] })`; it runs on
 * that section and returns findings, made with `ctx.finding()`.
 */
export function rule(id: string, fn: (node: SectionNode, ctx: Ctx) => Finding[]): Rule {
  return { __brand: 'Rule', id, run: fn }
}

/**
 * Makes a named rule for the whole document. Pass it in `contract({ rules: [...] })`. It runs
 * after the frontmatter and body checks, even when they found errors, and receives the typed
 * model, the context and the parse tree, so it can report an exact line. Its findings carry the
 * contract's `description`, when there is one, as `hint`.
 */
export function docRule<F>(
  id: string,
  fn: (doc: Doc<F>, ctx: Ctx, tree: DocTree) => Finding[],
): DocRule {
  return { __brand: 'DocRule', id, run: fn as DocRule['run'] }
}
