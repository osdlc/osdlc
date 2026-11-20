/**
 * What a person approved for a clean, and resolving it against a plan: the
 * rows selected or picked, the rows spared, and the risks allowed. `checkApproval`
 * refuses what can be refused before anything is swept; `resolveApproval`
 * names each reference's one plan row.
 */

import { realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import type { Plan } from './plan.ts'
import {
  KINDS,
  RISKS,
  RepoCleanerError,
  parseRowId,
  type Kind,
  type Risk,
  type RowId,
  type SweptWith,
} from './types.ts'
import { globRegExp } from './util.ts'

/** A risk allowed for every row (`row` absent), or for one row. */
export interface Allow {
  risk: Risk
  /** A row id or bare name, resolved as a pick is, or a row already resolved. */
  row?: string | Resolved | undefined
}

/**
 * What a person approved. Rows are named by id (`branch:feat/x`), or by a
 * bare name or path when only one plan row has it.
 *
 *   `select` work on exactly these rows, whatever their verdict, instead of
 *            the default: every `delete` row. For a checklist (`-i`) or a host
 *            that chose the rows itself.
 *   `pick`   also run these rows: a `review` row, or a `keep` row with an
 *            action, runs only when picked or selected.
 *   `spare`  leave these rows alone: a row, or a glob (`release/*`, `remote:
 *            origin/tmp-*`) matched against row names, and a remote branch's
 *            name without its remote. A remote branch spared by name is still
 *            checked, and the run stops if it moved or is gone since the plan.
 *   `allow`  the risks a row's action may carry.
 */
export interface Approval {
  /** Row names, or rows already resolved: a checklist names each by its repository. */
  select?: readonly (string | Resolved)[] | undefined
  pick?: readonly string[] | undefined
  spare?: readonly string[] | undefined
  allow?: readonly (Risk | Allow)[] | undefined
}

/** A row reference resolved to one plan row. */
export interface Resolved {
  repo: string
  id: RowId
}

/** An approval with every row resolved to its plan row. */
export interface ResolvedApproval {
  /** Null for the default selection: every `delete` row. */
  select: Resolved[] | null
  pick: Resolved[]
  /** Spared by name; a remote branch among them has its tip checked. */
  spare: Resolved[]
  /** Spared by a glob: left alone, nothing checked. */
  spareMatched: Resolved[]
  allow: { risk: Risk; row: Resolved | null }[]
}

/** Whether a `spare` entry is a glob rather than a row. */
export function isGlob(text: string): boolean {
  return /[*?]/.test(text)
}

/** A row reference as typed: a kind and a name, or a bare name (`kind: null`). */
export interface RowRef {
  kind: Kind | null
  name: string
}

/**
 * `kind:name`, or a bare name. A word before a colon that is not a kind is an
 * error (a typo such as `wt:x`), but a path is a bare name whatever colons it
 * holds: a prefix with a path separator in it is never a kind.
 */
export function parseRowRef(text: string): RowRef {
  if (text === '') throw new RepoCleanerError('bad-input', 'an empty row')
  const id = parseRowId(text)
  if (id !== null) {
    if (id.name === '')
      throw new RepoCleanerError('bad-input', `bad row ${JSON.stringify(text)}: no name`)
    return id
  }
  const colon = text.indexOf(':')
  if (colon > 1 && !/[\\/]/.test(text.slice(0, colon))) {
    throw new RepoCleanerError(
      'bad-input',
      `bad row ${JSON.stringify(text)}: expected <kind>:<name> with kind one of ${KINDS.join(', ')}, or a bare name`,
    )
  }
  return { kind: null, name: text }
}

/** `<risk>` for every row, or `<risk>=<row>` for one. */
export function parseAllow(text: string): Allow {
  const eq = text.indexOf('=')
  const risk = eq < 0 ? text : text.slice(0, eq)
  checkRisk(risk)
  if (eq < 0) return { risk }
  const row = text.slice(eq + 1)
  if (row === '') throw new RepoCleanerError('bad-input', `--allow ${text} names no row`)
  return { risk, row }
}

function checkRisk(risk: string): asserts risk is Risk {
  if (!(RISKS as readonly string[]).includes(risk)) {
    throw new RepoCleanerError(
      'bad-input',
      `unknown risk ${JSON.stringify(risk)}: expected one of ${RISKS.join(', ')}`,
    )
  }
}

/** A conflict for a reference no sweep with `options` could hold: a kind it left out, or a row outside its `--branch`. */
function checkScope(
  options: Pick<SweptWith, 'only' | 'branch'>,
  ref: RowRef,
  flag: string,
  text: string,
): void {
  const { only, branch } = options
  if (ref.kind !== null && !only.includes(ref.kind)) {
    throw new RepoCleanerError(
      'conflict',
      `${flag} ${text}: the sweep has no ${ref.kind} rows (it sweeps ${only.join(', ')})`,
    )
  }
  const outside =
    branch !== null &&
    ((ref.kind === 'branch' && ref.name !== branch) ||
      (ref.kind === 'remote' && !ref.name.endsWith(`/${branch}`)))
  if (outside) {
    throw new RepoCleanerError('conflict', `${flag} ${text} is not a row of --branch ${branch}`)
  }
}

/**
 * What can be refused of `approval` before anything is swept: a malformed
 * row or risk, a row a sweep with `options` could never hold, and a row
 * picked and spared as written. A row named two ways, and an `allow` for a
 * spared or unpicked row, are found when the approval is resolved against
 * the plan.
 */
export function checkApproval(
  options: Pick<SweptWith, 'only' | 'branch'>,
  approval: Approval,
): void {
  const refs: Array<[string, string]> = [
    ...(approval.select ?? [])
      .filter((t) => typeof t === 'string')
      .map((t): [string, string] => ['--select', t]),
    ...(approval.pick ?? []).map((t): [string, string] => ['--pick', t]),
    ...(approval.spare ?? [])
      .filter((t) => !isGlob(t))
      .map((t): [string, string] => ['--spare', t]),
  ]
  for (const glob of (approval.spare ?? []).filter(isGlob)) parseRowRef(glob)
  for (const a of approval.allow ?? []) {
    const { risk, row } = typeof a === 'string' ? { risk: a, row: undefined } : a
    checkRisk(risk)
    if (typeof row === 'string') refs.push(['--allow', row])
  }
  for (const [flag, text] of refs) checkScope(options, parseRowRef(text), flag, text)
  const chosen = [...(approval.select ?? []), ...(approval.pick ?? [])]
  const both = chosen.find((p) => typeof p === 'string' && (approval.spare ?? []).includes(p))
  if (both !== undefined)
    throw new RepoCleanerError('conflict', `${both} is both picked and spared`)
}

/** The plan rows `glob` matches; see {@link Approval.spare}. */
function matchGlob(plan: Plan, glob: string): Resolved[] {
  const ref = parseRowRef(glob)
  const re = globRegExp(ref.name)
  const hits: Resolved[] = []
  for (const repo of plan.repos) {
    for (const row of repo.rows) {
      const { kind, name } = parseRowId(row.id)!
      if (ref.kind !== null && ref.kind !== kind) continue
      const names = [name]
      if (kind === 'remote') names.push(name.slice(name.indexOf('/') + 1))
      if (names.some((n) => re.test(n))) hits.push({ repo: repo.root, id: row.id })
    }
  }
  return hits
}

/** The names a worktree reference may match: as written, against `cwd`, and resolved through symlinks. */
function pathForms(name: string, cwd: string): Set<string> {
  const abs = isAbsolute(name) ? name : resolve(cwd, name)
  const forms = new Set([name, abs])
  try {
    forms.add(realpathSync(abs))
  } catch {
    // A gone worktree has no real path; the plan names it as git did.
  }
  return forms
}

/** The plan row `text` names, its scope checked first so a row the plan could never hold is a conflict, not a miss. */
function resolveRef(plan: Plan, text: string | Resolved, flag: string, cwd: string): Resolved {
  if (typeof text !== 'string') {
    const found = plan.repos.find((r) => r.root === text.repo)?.rows.some((r) => r.id === text.id)
    if (found !== true) {
      throw new RepoCleanerError(
        'not-found',
        `${flag} ${text.id} in ${text.repo}: no such row in the plan`,
      )
    }
    return { repo: text.repo, id: text.id }
  }
  const ref = parseRowRef(text)
  checkScope(plan.options, ref, flag, text)
  const paths = ref.kind === null || ref.kind === 'worktree' ? pathForms(ref.name, cwd) : null
  const hits: Resolved[] = []
  for (const repo of plan.repos) {
    for (const row of repo.rows) {
      const { kind, name } = parseRowId(row.id)!
      if (ref.kind !== null && ref.kind !== kind) continue
      if (kind === 'worktree' ? paths!.has(name) : ref.name === name) {
        hits.push({ repo: repo.root, id: row.id })
      }
    }
  }
  if (hits.length === 0) {
    throw new RepoCleanerError('not-found', `${flag} ${text}: no such row in the plan`)
  }
  if (hits.length > 1) {
    const where = [...new Set(hits.map((h) => `${h.id} in ${h.repo}`))].join(', ')
    throw new RepoCleanerError(
      'ambiguous',
      `${flag} ${text} matches ${hits.length} rows (${where}); sweep or plan only the repository it is in${ref.kind === null ? ', or name it by its full id' : ''}`,
    )
  }
  return hits[0]!
}

export const keyOf = (r: Resolved): string => `${r.repo}\0${r.id}`
export const same = (a: Resolved, b: Resolved): boolean => a.repo === b.repo && a.id === b.id
export const uniq = (rows: Resolved[]): Resolved[] => [
  ...new Map(rows.map((r) => [keyOf(r), r])).values(),
]

/**
 * `approval` resolved against `plan`, or a {@link RepoCleanerError} for one
 * that contradicts itself or names rows the plan does not have.
 */
export function resolveApproval(plan: Plan, approval: Approval, cwd: string): ResolvedApproval {
  checkApproval(plan.options, approval)
  const select =
    approval.select === undefined
      ? null
      : uniq(approval.select.map((t) => resolveRef(plan, t, '--select', cwd)))
  const pick = uniq((approval.pick ?? []).map((t) => resolveRef(plan, t, '--pick', cwd)))
  const named = (approval.spare ?? []).filter((t) => !isGlob(t))
  const spare = uniq(named.map((t) => resolveRef(plan, t, '--spare', cwd)))
  const spareMatched = uniq(
    (approval.spare ?? []).filter(isGlob).flatMap((g) => matchGlob(plan, g)),
  )
  const chosen = [...(select ?? []), ...pick]
  const picked = new Set(chosen.map(keyOf))
  const spared = new Set([...spare, ...spareMatched].map(keyOf))
  const both = chosen.find((p) => spared.has(keyOf(p)))
  if (both !== undefined)
    throw new RepoCleanerError('conflict', `${both.id} is both picked and spared`)
  const allow = (approval.allow ?? []).map((a) => {
    const { risk, row } = typeof a === 'string' ? { risk: a, row: undefined } : a
    if (row === undefined) return { risk, row: null }
    const at = resolveRef(plan, row, '--allow', cwd)
    const named = typeof row === 'string' ? row : row.id
    if (spared.has(keyOf(at))) {
      throw new RepoCleanerError('conflict', `--allow ${risk}=${named}: ${at.id} is spared`)
    }
    if (select !== null && !picked.has(keyOf(at))) {
      throw new RepoCleanerError('conflict', `--allow ${risk}=${named}: ${at.id} is not selected`)
    }
    return { risk, row: at }
  })
  return {
    select,
    pick,
    spare,
    spareMatched: spareMatched.filter((r) => !spare.some((s) => same(s, r))),
    allow,
  }
}

/** Whether `allow` grants `risk` for the row `at`. */
export function allowed(allow: ResolvedApproval['allow'], at: Resolved, risk: Risk): boolean {
  return allow.some((a) => a.risk === risk && (a.row === null || same(a.row, at)))
}
