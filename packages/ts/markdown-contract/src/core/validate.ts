/**
 * The `Contract.validate` / `read` entry points — the one-pass over the planes that
 * produces the merged, deterministically sorted `Finding[]`.
 * `grammar.ts`'s `contract()` wires its `validate` / `read` methods straight to these,
 * passing the retained `ContractDef`.
 *
 * One pass:
 *   1. parse `source` (or accept a pre-parsed `DocTree`);
 *   2. run the STRUCTURE plane (`matchStructure`) — its kind-gate gates the content leaf;
 *   3. run the CONTENT plane (`matchContent`) — frontmatter Zod + each section's leaf;
 *   4. run the cross-plane `docRule(...)` rules over the built model (`def.rules`), each
 *      emitting `rule/*` findings via `ctx.finding(...)`;
 *   5. merge + deterministically SORT all findings (the plane-aware comparator below);
 *   6. GATE the model: `doc` present iff no `error`-level finding, built lazily.
 *
 * `read()` runs `validate` and returns `doc`, or throws {@link ContractError} carrying the
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

/** A `DocTree` is the pre-parsed input shape; a string is parsed with the bundled projection. */
function asTree(input: string | DocTree): DocTree {
  return typeof input === 'string' ? parse(input) : input
}

// ── Deterministic ordering ─────────────────────────

/**
 * The merge planes, in their tie-break order. A finding's plane is its id prefix. `text` sits
 * after `content` and before `rule`: a declarative text constraint's `text/*` finding
 * sorts into its own plane rather than being lumped in with the custom-rule namespace.
 */
const PLANE_ORDER = ['frontmatter', 'structure', 'content', 'text', 'rule'] as const

/**
 * The plane a finding belongs to, derived from its id prefix. The named planes map by their
 * leading segment; any other prefix (a contract-chosen rule namespace like `task/...` or
 * `summary/...`, minted by `rule` / `docRule`) is the `rule` plane — so a custom rule id sorts
 * after `content` and `text`, as the plane order requires.
 */
function planeRank(id: string): number {
  const area = id.slice(0, id.indexOf('/'))
  const i = (PLANE_ORDER as readonly string[]).indexOf(area)
  return i === -1 ? PLANE_ORDER.indexOf('rule') : i
}

/**
 * Sort findings deterministically so goldens pin:
 *   1. ascending `pos.line` — a no-`pos` (whole-document) finding sorts FIRST, as line 0;
 *   2. ties on a line break by `pos.col` (a no-`col` finding sorts first, as col 0);
 *   3. then by PLANE order (`frontmatter` → `structure` → `content` → `text` → `rule`);
 *   4. then by stable emission order (the index the finding was collected at).
 * The sort is total and stable; the `i` tie-break makes it deterministic across engines.
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
      return a.i - b.i // stable emission order
    })
    .map((x) => x.f)
}

// ── The one-pass orchestration ─────────────────────────────────────────────────────

/**
 * Run the cross-plane `docRule(...)` rules over the built model, collecting their findings.
 * Each rule's `fn(doc, ctx, tree)` sees the whole typed doc (both planes) and also the projected
 * `tree` — so a whole-document scope can pin a finding at the exact offending source line — and
 * mints `rule/*` findings through `ctx.finding(...)`, which stamps `path` and the registry default
 * level. The model is built once here only when the contract declares rules (so a rule-free
 * validation never forces model construction).
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
  // Document-scoped rules (incl. the body-root `textRule`) have no nearer description than the
  // contract root, so their findings carry it as `hint` when one is authored.
  const rctx = withHint(ctx, def.description)
  for (const r of def.rules) {
    out.push(...r.run(doc as Doc, rctx, tree))
  }
}

/**
 * The "show me everything" door: problems come back as findings, not exceptions. Parses a `source: string`
 * (bundled projection) or accepts a pre-parsed `DocTree`. Runs every plane in one
 * pass, merges + sorts the findings, and gates the typed model on no error-level
 * finding: `doc` is built lazily (a getter) so a passing fixture that only reads
 * `.findings` never forces model construction; when there is an error-level finding, `doc`
 * is `undefined`. The projection (`tree`) is always returned, valid or not.
 */
export function validate<F, B>(
  def: ContractDef<F, B>,
  input: string | DocTree,
  ctx: ValidateCtx,
): ValidationResult<F, B> {
  const tree = asTree(input)
  const fctx = makeCtx(ctx.path, defaultRegistry())

  const findings: Finding[] = []
  // Contract-independent outline check: a sub-heading that skips a level (H2→H4) warns,
  // whether or not the grammar declares those sections. Its nearest
  // enclosing description is the contract root's, when one is authored.
  findings.push(...scanHeadingDepthJumps(tree.root, withHint(fctx, def.description)))
  // Structure plane — its kind-gate gates the content leaf (a non-table never reaches
  // table-column validation), so it must run before content.
  if (def.body) {
    findings.push(...matchStructure(tree, def.body, fctx, def.description))
  }
  // Content plane: frontmatter Zod + each section's content leaf over a present, correct-kind
  // block. Guarded inside `matchContent` so it never re-reports the structure kind-gate.
  const values = createParsedValues()
  findings.push(...matchContent(tree, def, fctx, values))
  // Rule plane: cross-plane `docRule(...)` over the built model (only when rules exist).
  runDocRules(def, tree, fctx, values, findings)

  const sorted = sortFindings(findings)
  const hasError = sorted.some((f) => f.level === 'error')

  const result: ValidationResult<F, B> = { findings: sorted, tree }
  if (!hasError) {
    // `doc` present iff valid, built LAZILY — a passing fixture that only reads `.findings`
    // never forces model construction. A getter defers the build to first access and caches.
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
  // When `hasError`, `doc` stays absent (the property is simply not defined ⇒ `undefined`).
  return result
}

/**
 * The "give me the data or fail" door — returns the typed model, or throws
 * {@link ContractError} carrying the error-level findings. Runs `validate`,
 * then either returns `doc` (no error-level finding) or throws with the error findings.
 */
export function read<F, B>(def: ContractDef<F, B>, source: string, ctx: ValidateCtx): Doc<F, B> {
  const { findings, doc } = validate<F, B>(def, source, ctx)
  const errors = findings.filter((f) => f.level === 'error')
  if (errors.length > 0 || doc === undefined) {
    throw new ContractError(errors)
  }
  return doc
}
