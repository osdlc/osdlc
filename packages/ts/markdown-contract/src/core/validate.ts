/**
 * `Contract.validate` and `Contract.read`. `contract()` in `grammar.ts` calls these with its
 * `ContractDef`.
 *
 * `validate` runs in one pass:
 *   1. Parse `source`, or take a `DocTree` that is already parsed.
 *   2. Warn on headings that skip a level.
 *   3. Run the structure plane (`matchStructure`). A block of the wrong kind stops the content
 *      check for that leaf.
 *   4. Run the content plane (`matchContent`): the frontmatter schema and each section's leaf.
 *   5. Run the `docRule(...)` rules (`def.rules`) over the typed model.
 *   6. Merge and sort all findings (see `sortFindings`).
 *   7. Set `doc` only when there is no `error`-level finding. It is built on first access.
 *
 * `read()` runs `validate` and returns `doc`, or throws {@link ContractError} with the
 * error-level findings.
 */
import { matchContent } from './content.js'
import { ContractError } from './finding.js'
import { buildModel } from './model.js'
import { createParsedValues, type ParsedValues } from './parsed-values.js'
import { parse } from './projection.js'
import { defaultRegistry, makeCtx, withHint } from './registry.js'
import { matchStructure, scanHeadingDepthJumps } from './structure.js'
import type {
  ContractDef,
  Ctx,
  Doc,
  DocTree,
  Finding,
  ValidateCtx,
  ValidationResult,
} from './types.js'

/** Parses a string. A `DocTree` is returned as it is. */
function asTree(input: string | DocTree): DocTree {
  return typeof input === 'string' ? parse(input) : input
}

// ── Ordering ─────────────────────────

/**
 * The planes, in tie-break order. A finding's plane is its id prefix. `text/*` findings from
 * text checks have their own plane, after `content` and before `rule`, so they do not sort with
 * custom rule ids.
 */
const PLANE_ORDER = ['frontmatter', 'structure', 'content', 'text', 'rule'] as const

/**
 * The rank of a finding's plane, from its id prefix. Any prefix not in `PLANE_ORDER` (an id a
 * contract's `rule` or `docRule` chose, such as `task/...` or `summary/...`) ranks as `rule`, so
 * custom rule ids sort after `content` and `text`.
 */
function planeRank(id: string): number {
  const area = id.slice(0, id.indexOf('/'))
  const i = (PLANE_ORDER as readonly string[]).indexOf(area)
  return i === -1 ? PLANE_ORDER.indexOf('rule') : i
}

/**
 * Sorts findings into a fixed order, so expected findings in tests can be compared exactly:
 *   1. By `pos.line`, ascending. A finding with no `pos` (whole document) counts as line 0.
 *   2. Then by `pos.col`. A finding with no `col` counts as column 0.
 *   3. Then by plane (`frontmatter`, `structure`, `content`, `text`, `rule`).
 *   4. Then by the order the findings were collected in.
 * The last key makes the order the same in every engine.
 */
function sortFindings(findings: Finding[]): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const la = a.f.pos?.line ?? 0
      const lb = b.f.pos?.line ?? 0
      if (la !== lb) return la - lb
      const ca = a.f.pos?.col ?? 0
      const cb = b.f.pos?.col ?? 0
      if (ca !== cb) return ca - cb
      const pa = planeRank(a.f.id)
      const pb = planeRank(b.f.id)
      if (pa !== pb) return pa - pb
      return a.i - b.i
    })
    .map((x) => x.f)
}

// ── The pass ─────────────────────────────────────────────────────

/**
 * Runs the `docRule(...)` rules over the typed model and adds their findings to `out`. Each
 * rule's `fn(doc, ctx, tree)` gets the typed doc and the parse tree, so it can report the exact
 * source line. Its findings come from `ctx.finding(...)`, which sets `path` and the default
 * level. The model is built here only when the contract has rules.
 */
function runDocRules<F, B>(
  def: ContractDef<F, B>,
  tree: DocTree,
  ctx: Ctx,
  values: ParsedValues,
  out: Finding[],
): void {
  if (!def.rules || def.rules.length === 0) return
  const doc = buildModel(tree, def, { path: ctx.path }, values)
  // Document rules (including a `textRule` on the whole body) have no description nearer than
  // the contract's, so their findings carry it as `hint` when there is one.
  const rctx = withHint(ctx, def.description)
  for (const r of def.rules) {
    out.push(...r.run(doc as Doc, rctx, tree))
  }
}

/**
 * Checks a document and returns problems as findings. It does not throw on a bad document.
 * Parses a `source` string, or takes a `DocTree` that is already parsed. Runs every plane in
 * one pass and sorts the findings. `doc` is set only when there is no error-level finding. It
 * is a getter, so the typed model is built only when a caller reads it. `tree` is always
 * returned.
 */
export function validate<F, B>(
  def: ContractDef<F, B>,
  input: string | DocTree,
  ctx: ValidateCtx,
): ValidationResult<F, B> {
  const tree = asTree(input)
  const fctx = makeCtx(ctx.path, defaultRegistry())

  const findings: Finding[] = []
  // A heading that skips a level (H2 to H4) warns, whatever the grammar declares. Its hint is
  // the contract's description, when there is one.
  findings.push(...scanHeadingDepthJumps(tree.root, withHint(fctx, def.description)))
  // Structure runs before content. A block of the wrong kind (say, not a table) never reaches
  // the content check for that leaf (say, table columns).
  if (def.body) {
    findings.push(...matchStructure(tree, def.body, fctx, def.description))
  }
  // Content: the frontmatter schema and each section's leaf, on blocks of the right kind.
  // `matchContent` skips the wrong-kind blocks so it does not report them twice.
  const values = createParsedValues()
  findings.push(...matchContent(tree, def, fctx, values))
  runDocRules(def, tree, fctx, values, findings)

  const sorted = sortFindings(findings)
  const hasError = sorted.some((f) => f.level === 'error')

  const result: ValidationResult<F, B> = { findings: sorted, tree }
  if (!hasError) {
    // A getter builds the model on first access and caches it.
    let built: Doc<F, B> | undefined
    Object.defineProperty(result, 'doc', {
      enumerable: true,
      configurable: true,
      get(): Doc<F, B> {
        if (built === undefined) built = buildModel(tree, def, { path: ctx.path }, values)
        return built
      },
    })
  }
  return result
}

/**
 * Runs `validate` and returns the typed model. Throws {@link ContractError} with the
 * error-level findings when there are any.
 */
export function read<F, B>(def: ContractDef<F, B>, source: string, ctx: ValidateCtx): Doc<F, B> {
  const { findings, doc } = validate<F, B>(def, source, ctx)
  const errors = findings.filter((f) => f.level === 'error')
  if (errors.length > 0 || doc === undefined) {
    throw new ContractError(errors)
  }
  return doc
}
