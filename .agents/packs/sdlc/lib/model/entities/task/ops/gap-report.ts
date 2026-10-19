/**
 * `task gap-report` op — the deterministic readiness-gap composite over a task
 * document.
 *
 * The single composite over the implementation-ready contract
 * (`solutions/ontological/lib/model/entities/task/implementation-ready.md`): every caller
 * (task-auto-define, task-define, task-review, task-ensure-ready) reads ONE
 * structured readiness-gap report instead of re-spelling the fan-out over the
 * per-slice verbs. It composes — never duplicates — the sibling ops by
 * invoking their handlers against the same ctx:
 *
 *   - `scan-placeholders`   → unresolved spec-drift placeholders in required
 *                             sections (`TBD`, `<...>`, empty table cells, ...).
 *   - `parse-touchpoints`   → the `## Areas` table SHAPE (`table` / `prose` /
 *                             `missing` / `bulleted-legacy`) + per-row shape
 *                             errors, reported for INFORMATION only — v7 made
 *                             Areas advisory, so nothing this op parses from it
 *                             becomes a gap (see the Areas note below).
 *   - `check-claims`        → every registered claim resolver's findings
 *                             (relocated paths, vacuous-universal ACs, ...).
 *
 * Plus THREE pieces of deterministic logic the sibling ops don't cover:
 *   1. required-section presence — which of the contract's required body sections
 *      are PRESENT vs ABSENT (a fence-aware H2 walk).
 *   2. TYPED-CONTENT enforcement sourced from `TaskReadyContract` (the strict
 *      sibling of the birth-floor contract — the machine encoding of
 *      implementation-ready.md). The contract validates the doc once; this op
 *      folds in only the ONE typed-shape violation that still gates readiness:
 *        - `content/list/item-kind`       → a non-checkbox Acceptance-criteria item
 *          (→ a `section` gap, code `ac-not-checklist`);
 *        - `content/list/min-items`       → an empty Acceptance-criteria list
 *          (→ a `section` gap, code `ac-empty`).
 *      A missing declared column on an `## Areas` table
 *      (`content/table/column-missing`) is computed and surfaced under
 *      `touchpoints.parse_errors` for information, but deliberately NOT turned
 *      into a `gaps[]` entry — Areas is advisory (see `implementation-ready.md`'s
 *      `## Areas` entry): a malformed or non-table Areas section costs nothing.
 *   3. PARENTHOOD (`parenthood`) — whether any other task names this one in
 *      `parent_key`, plus the child basenames. The implementation-ready contract
 *      binds LEAF tasks ([[D-VSLI-distributed-work-runner-architecture]] settled
 *      leaf-only dispatch): a task with children is an organizational rollup, so
 *      its section/placeholder/claim gaps are category errors. This slice is the
 *      deterministic fact a gate reads to know the contract does not bind — see
 *      the facts-not-judgment boundary below.
 *
 * DELIBERATE BOUNDARY — facts, not judgment. This op is purely mechanical and
 * runs NO LLM. It does NOT decide whether a present section is "thin" or how to
 * weigh severities. Every such interpretive call belongs to the consuming skill
 * (ensure-ready / auto-define / define / review); the
 * `/sdlc:task-ensure-ready` SKILL.md is the reference interpretation layer.
 *
 * Parenthood obeys that same boundary: it is REPORTED, never acted on. A parent's
 * other slices are computed and emitted exactly as a leaf's — the op does not
 * suppress, alter, or skip sections/placeholders/claims for a parent, and
 * `has_gaps` is unaffected by it. Exempting a rollup from the leaf contract is
 * the caller's interpretation, made from this fact.
 *
 * The structured `gaps` array is a flat, caller-iterable union of every
 * deterministic gap fact, each tagged with its `category` and a machine
 * `code`; the per-category objects carry the full detail. `has_gaps` is true
 * iff `gaps` is non-empty.
 *
 * A missing/unreadable task file is an INVALID_INPUT OpError (exit 1), same as
 * the sibling read-only doc ops. `--dry-run` is a no-op: this op is read-only
 * and never mutates project state, so dry and wet runs are byte-identical.
 */

import { basename } from 'node:path'

import { parse, sectionsAt, sectionForLine as enclosingSectionForLine } from 'markdown-contract'
import { z } from 'zod'

import { defineOp, type OpCtx, type OpIo } from '@lib/registry'
import { unwrapWikilink } from '@lib/util/wikilinks'
import { resolveTarget } from '@lib/model/corpus/resolve'
import { scanEntities } from '@lib/model/read'
import type { Finding } from '@lib/model/entities/task/claims'
import {
  TASK_BODY,
  TaskReadyContract,
  requiredTaskSections,
  taskSectionLookup,
} from '@lib/model/entities/task/schema'

import { readTaskDoc } from './_task_doc.ts'
import checkClaimsOp from './check-claims.ts'
import parseTouchpointsOp from './parse-touchpoints.ts'
import scanPlaceholdersOp from './scan-placeholders.ts'

// ── required-section presence (the one new deterministic slice) ──────────────

/**
 * The body sections the ready contract requires, in contract order — sourced
 * from `TASK_BODY`, the canonical section table, rather than re-spelled here.
 * A section that is `optional` at ready is not a presence gap, so this op can
 * no longer be stricter than the contract it reports against (it used to
 * hard-require `Today`, which the contract has always marked optional).
 */
const REQUIRED_SECTIONS = requiredTaskSections('ready')

/**
 * Every declared section, keyed by its accepted spellings — the lookup that
 * canonicalizes a heading for attribution. Deliberately wider than
 * `REQUIRED_SECTIONS`: an optional section still has a canonical name, and a
 * content finding inside one must anchor to it.
 */
const CANONICAL_BY_HEADING = taskSectionLookup(TASK_BODY, (s) => s.names[0])

/**
 * Collect the set of lower-cased H2 header texts present in a document, ignoring
 * headers inside fenced code blocks (so a `## Goal` shown inside a ` ``` ` block
 * — e.g. a doc example — does not count as the real section). Sourced from the
 * shared `markdown-contract` projection (`parse(text).root.sections` are the
 * top-level, fence-aware H2 nodes), replacing the hand-rolled fence-tracking H2
 * walk this op used to carry. Accepts either a full document (frontmatter is
 * stripped by the projection) or a bare body.
 */
function presentH2Headers(text: string): Set<string> {
  const present = new Set<string>()
  // Only `## ` (depth-2) headings count, matching the old `^##\s+` walk: an
  // H1 is the document title and a deeper heading is a subsection, neither a
  // required body section. `sectionsAt` absorbs the depth-2 filter.
  for (const s of sectionsAt(parse(text).root, 2)) {
    present.add(s.name.trim().toLowerCase())
  }
  return present
}

/** Per-required-section presence, in contract order. */
function sectionPresence(text: string): Array<{ section: string; present: boolean }> {
  const headers = presentH2Headers(text)
  return REQUIRED_SECTIONS.map((s) => ({
    section: s.names[0],
    present: s.names.some((n) => headers.has(n.trim().toLowerCase())),
  }))
}

// ── parenthood (a structural corpus fact, never a gap) ───────────────────────

/** Whether any task names this one as its parent, and which ones. */
interface Parenthood {
  /** True iff at least one task's `parent_key` resolves to this task. */
  is_parent: boolean
  /** Child basenames (filename without `.md`), sorted. */
  children: string[]
}

/**
 * Invert `parent_key` across the task corpus and return the children of
 * `selfBasename`.
 *
 * Reads the corpus through the bulk frontmatter primitive (`scanEntities` over
 * `docs/planning/tasks/`, i.e. `readRawFrontmatter` per file) — never a
 * hand-rolled read (`model/README.md`). `parent_key` is a wikilink whose slug
 * half is optional, so each value is unwrapped and then resolved against the
 * task basenames the same way `depends_on` targets are: `[[T-ARCR]]` and
 * `[[T-ARCR-leaf-parent-readiness-applicability]]` both resolve to the same
 * file. An ambiguous or dangling reference names no parent and is ignored.
 *
 * Deliberately the SAME two primitives (`unwrapWikilink` + `resolveTarget`)
 * `task next`'s leaf predicate uses, so the gate's notion of "parent" cannot
 * drift from the orchestrator's. Parenthood is STRUCTURAL, not state-dependent:
 * a parent whose only child is `closed/done` is still a parent.
 */
function taskChildren(projectRoot: string, selfBasename: string): string[] {
  const rows = scanEntities('task', projectRoot)
  const basenames = new Set(rows.map((r) => r.basename))
  const children: string[] = []
  for (const row of rows) {
    const raw = row.fm?.['parent_key']
    if (typeof raw !== 'string') continue
    const unwrapped = unwrapWikilink(raw)
    if (unwrapped === null) continue
    if (resolveTarget(unwrapped, basenames) !== selfBasename) continue
    children.push(row.basename)
  }
  // `scanEntities` already walks in name order; sort anyway so the slice is
  // deterministic regardless of the walk's ordering guarantees.
  return children.sort()
}

// ── typed-content enforcement (sourced from TaskReadyContract) ────────────────

/** A typed-content gap the strict ready-contract surfaces. */
interface ContentGap {
  /** Which content finding fired. */
  id: string
  /** The canonical section it anchors to ("Areas" / "Acceptance criteria"). */
  section: string | null
  /** 1-indexed line into the task file, or null. */
  line: number | null
  /** The contract's own finding message. */
  message: string
}

/** Canonicalize a heading text to the report's canonical section name (or pass through). */
function canonicalSectionName(heading: string): string {
  return CANONICAL_BY_HEADING.get(heading.trim().toLowerCase()) ?? heading.trim()
}

/**
 * Validate the task once against the strict `TaskReadyContract` and extract the
 * typed-content violations. Returns the column-missing findings (the `## Areas`
 * table, reported for INFORMATION only — see the `touchpoints` doc comment on
 * the output schema) and the Acceptance-criteria list-shape findings
 * (non-checkbox / empty, which DO gate readiness).
 */
export function readyContractContentGaps(
  text: string,
  path: string,
): { columnMissing: ContentGap[]; acShape: ContentGap[] } {
  const result = TaskReadyContract.validate(text, { path })
  const root = result.tree.root

  const columnMissing: ContentGap[] = []
  const acShape: ContentGap[] = []

  for (const f of result.findings) {
    // Attribute each line-anchored finding to its enclosing top-level section:
    // `sectionForLine` returns the last heading (any depth) whose `pos.line` is
    // <= the finding line — the same "last heading ≤ line" scan the local helper
    // did — then canonicalize its heading text. A whole-document finding (no
    // pos), or one before any heading, maps to null.
    const line = f.pos?.line
    const enclosing = line === undefined ? undefined : enclosingSectionForLine(root, line)
    const section = enclosing !== undefined ? canonicalSectionName(enclosing.name) : null
    if (f.id === 'content/table/column-missing') {
      columnMissing.push({ id: f.id, section, line: f.pos?.line ?? null, message: f.message })
    } else if (f.id === 'content/list/item-kind' || f.id === 'content/list/min-items') {
      // List-shape findings only fire on the checkbox-typed `Acceptance criteria`
      // leaf; anchor them there even when the line attribution is fuzzy.
      acShape.push({
        id: f.id,
        section: section ?? 'Acceptance criteria',
        line: f.pos?.line ?? null,
        message: f.message,
      })
    }
  }
  return { columnMissing, acShape }
}

// ── composition helpers ──────────────────────────────────────────────────────

/** Re-run an input through the op's own Zod schema, then its handler. */
function runChild<T>(
  op: { input: z.ZodTypeAny; handler: (input: never, ctx: OpCtx) => unknown },
  projectRoot: string,
  task: string,
  ctx: OpCtx,
): T {
  const parsed = op.input.parse({ projectRoot, task }) as never
  return op.handler(parsed, ctx) as T
}

// Loose shapes for the sibling ops' outputs — each op pins its own contract;
// here we read only the fields the report surfaces.
interface PlaceholderMatch {
  section: string
  phrase: string
  line: number
  snippet: string
}
interface TouchpointSection {
  kind: string
  errors: string[]
  // Rows are plain `{area, note}` citations, not resolved Locations — this op
  // reads only `kind`/`errors` off the section, so rows are left untyped here.
  rows: unknown[]
}
interface ParseTouchpointsOut {
  areas: TouchpointSection
}
type CheckClaimsOut = Record<string, Array<Omit<Finding, 'resolver'>>>

// ── output schema ─────────────────────────────────────────────────────────────

/** One flat, caller-iterable gap fact. */
const gap = z.object({
  /** Which deterministic slice surfaced this gap. */
  category: z.enum(['section', 'placeholder', 'claim']),
  /** Machine-stable token for programmatic dispatch. */
  code: z.string(),
  /** Section the gap anchors to (canonical section name), when applicable. */
  section: z.string().nullable(),
  /** 1-indexed line into the task file, or null when not line-anchored. */
  line: z.number().int().nullable(),
  /** Human-readable description of the deterministic fact. */
  message: z.string(),
})

const output = z.object({
  /** True iff `gaps` is non-empty. */
  has_gaps: z.boolean(),
  /** Flat union of every deterministic gap fact, in category order. */
  gaps: z.array(gap),
  /**
   * Structural corpus fact, NOT a gap: whether another task names this one in
   * `parent_key` (making it an organizational rollup the leaf contract does not
   * bind) and which tasks those are. Sits ahead of the per-slice detail because
   * it qualifies how a caller should read that detail — a parent's section /
   * placeholder / claim gaps are category errors — but it changes none of it,
   * and never contributes to `gaps` / `has_gaps`.
   */
  parenthood: z.object({
    /** True iff at least one task's `parent_key` resolves to this task. */
    is_parent: z.boolean(),
    /** Child basenames (filename without `.md`), sorted. */
    children: z.array(z.string()),
  }),
  /** Per-required-section presence (contract order). */
  sections: z.array(z.object({ section: z.string(), present: z.boolean() })),
  /** Verbatim `scan-placeholders` output. */
  placeholders: z.array(
    z.object({
      section: z.string(),
      phrase: z.string(),
      line: z.number().int(),
      snippet: z.string(),
    }),
  ),
  /**
   * `## Areas` table shape + shape errors — INFORMATIONAL only. Areas is
   * advisory (v7): nothing here ever becomes a `gaps[]` entry, so a caller
   * that wants readiness disqualifiers has no reason to read this object; it
   * exists for callers (e.g. `/sdlc:task-review`) that want to narrate the
   * section's shape without gating on it.
   */
  touchpoints: z.object({
    areas_kind: z.string(),
    /** Per-row/section shape errors collected by `parse-touchpoints`, informational. */
    parse_errors: z.array(
      z.object({ section: z.string(), location: z.string().nullable(), error: z.string() }),
    ),
  }),
  /** `disqualifier`-severity claim-resolver findings, keyed by resolver. */
  claims: z.array(
    z.object({
      resolver: z.string(),
      line: z.number().int().nullable(),
      severity: z.enum(['disqualifier', 'warning']),
      message: z.string(),
    }),
  ),
})

type Output = z.infer<typeof output>

// ── render hook — deterministic single-line summary ──────────────────────────

function renderGapReport(out: Output, io: OpIo): number {
  const byCategory = (cat: string): number => out.gaps.filter((g) => g.category === cat).length
  const parts = [
    `gaps=${out.gaps.length}`,
    `sections=${byCategory('section')}`,
    `placeholders=${byCategory('placeholder')}`,
    `claims=${byCategory('claim')}`,
    // Last token, and the only non-count one: the applicability fact a gate
    // reads before weighing any of the counts ahead of it.
    `parent=${out.parenthood.is_parent}`,
  ]
  io.stdout(`GAP-REPORT ${parts.join(' ')}\n`)
  return 0
}

// ── op definition ─────────────────────────────────────────────────────────────

const input = z.object({
  projectRoot: z.string(),
  /** Task-file path (absolute or project-relative) or bare basename. */
  task: z.string(),
})

export default defineOp({
  noun: 'task',
  verb: 'gap-report',
  summary:
    'Deterministic readiness-gap composite for a task doc (sections + placeholders + touchpoints + claims + parenthood); no LLM.',
  // Hidden plumbing ([[D-H7FS-op-substrate-surface]] §2): a gate/agent-reached
  // composite no human types, sibling to parse-/scan-/check- ops.
  hidden: true,
  // Read-only: this op is explicitly documented as never mutating project
  // state (see module docblock's "facts, not judgment" section).
  mutating: false,
  input,
  output,
  cli: {
    positionals: ['task'],
    render: renderGapReport,
  },
  handler: (args, ctx): Output => {
    // Fail fast (and once) on a bad task argument — the sibling ops would each
    // throw the same INVALID_INPUT, but reading the doc here keeps one error.
    const { text, path } = readTaskDoc(args.projectRoot, args.task)

    const placeholders = runChild<PlaceholderMatch[]>(
      scanPlaceholdersOp,
      args.projectRoot,
      args.task,
      ctx,
    )
    const parsed = runChild<ParseTouchpointsOut>(
      parseTouchpointsOp,
      args.projectRoot,
      args.task,
      ctx,
    )
    const claimAggregate = runChild<CheckClaimsOut>(checkClaimsOp, args.projectRoot, args.task, ctx)

    const sections = sectionPresence(text)

    // Parenthood is a FACT reported alongside the gap slices, never a switch
    // over them: every slice below is computed for a parent exactly as for a
    // leaf. Interpreting the fact — exempting a rollup from the leaf contract —
    // belongs to the caller, per this op's facts-only boundary.
    const children = taskChildren(args.projectRoot, basename(path, '.md'))
    const parenthood: Parenthood = { is_parent: children.length > 0, children }

    // ── flatten each slice into structured detail + flat gap facts ───────────

    const gaps: z.infer<typeof gap>[] = []

    // 1. Missing required sections.
    for (const s of sections) {
      if (!s.present) {
        gaps.push({
          category: 'section',
          code: 'section-missing',
          section: s.section,
          line: null,
          message: `Required section "${s.section}" is absent.`,
        })
      }
    }

    // 2. Placeholders.
    for (const p of placeholders) {
      gaps.push({
        category: 'placeholder',
        code: 'placeholder',
        section: p.section,
        line: p.line,
        message: `Unresolved placeholder ${p.phrase} in "${p.section}": ${p.snippet}`,
      })
    }

    // 3. Areas shape — INFORMATIONAL only (advisory, v7). Section-level shape
    // errors (e.g. a row with the wrong cell count) are collected for
    // `touchpoints.parse_errors` so a caller can narrate them, but never
    // become a `gaps[]` entry. Individual rows carry no per-row error: an
    // Area is a plain `{area, note}` citation, not a resolved Location.
    const parseErrors: Output['touchpoints']['parse_errors'] = []
    for (const err of parsed.areas.errors) {
      parseErrors.push({ section: 'Areas', location: null, error: err })
    }

    // 3a. Typed-content enforcement sourced from the strict `TaskReadyContract`
    // (the machine encoding of implementation-ready.md). A missing declared
    // column on an `## Areas` table is collected here too — INFORMATIONAL
    // only, same as the shape errors above (Areas is advisory; see the
    // `touchpoints` output doc comment). `acShape` DOES gate readiness — the
    // Acceptance-criteria contract stays exactly as strict as before.
    const { columnMissing, acShape } = readyContractContentGaps(text, args.task)
    for (const cm of columnMissing) {
      const sectionName = cm.section ?? 'Areas'
      parseErrors.push({ section: sectionName, location: null, error: cm.message })
    }

    // 3b. Acceptance-criteria list-shape enforcement (also from
    // `TaskReadyContract`): the contract's checkbox/min-items leaf catches a
    // non-checkbox or empty AC list — typed shapes the legacy slices never
    // inspected. These are content defects of the Acceptance-criteria SECTION, so
    // they surface as `section`-category gaps (the four-way `*_kind` is unaffected).
    for (const ac of acShape) {
      const code = ac.id === 'content/list/min-items' ? 'ac-empty' : 'ac-not-checklist'
      gaps.push({
        category: 'section',
        code,
        section: ac.section,
        line: ac.line,
        message: `Acceptance-criteria content error: ${ac.message}`,
      })
    }

    // 4. Claims — only `disqualifier`-severity findings are gaps; warnings are
    // advisory (no resolver emits warning today, but the tier exists).
    const claims: Output['claims'] = []
    for (const [resolver, findings] of Object.entries(claimAggregate)) {
      for (const f of findings) {
        claims.push({ resolver, line: f.line, severity: f.severity, message: f.message })
        if (f.severity === 'disqualifier') {
          gaps.push({
            category: 'claim',
            code: `claim-${resolver}`,
            section: null,
            line: f.line,
            message: `Claim resolver "${resolver}": ${f.message}`,
          })
        }
      }
    }

    return {
      has_gaps: gaps.length > 0,
      gaps,
      parenthood,
      sections,
      placeholders,
      touchpoints: {
        areas_kind: parsed.areas.kind,
        parse_errors: parseErrors,
      },
      claims,
    }
  },
})

export { sectionPresence, presentH2Headers }
