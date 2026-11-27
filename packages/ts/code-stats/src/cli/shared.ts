import { exitCodeFor, type FlagSpec, type FlagValues } from '@osdlc/cli-tool'
import { CommandError, UsageError, type CommandContext } from '@osdlc/cli-tool/command'

import { CodeStatsError, type Failure } from '../error.ts'
import { changeSpecFrom, parseChangeSpec } from '../git/change.ts'
import type { Runners } from '../git/repo.ts'
import { RULE_GROUPS, type GroupRules } from '../groups.ts'
import { createScannerRegistry, type ScannerRegistry } from '../scan/registry.ts'
import { createTreeSitterScanners } from '../tree-sitter/index.ts'
import type { ChangeSpec } from '../types.ts'

/** The flags every command takes. `--json` is not here: the app gives every command `--json` and `--output`. */
export const COMMON_FLAGS = {
  generated: { kind: 'list', valueName: 'glob', help: 'Count matching files as generated.' },
  vendored: { kind: 'list', valueName: 'glob', help: 'Count matching files as vendored.' },
  instructions: {
    kind: 'list',
    valueName: 'glob',
    help: 'Count matching files as agent instructions (their prose is logic).',
  },
  docs: { kind: 'list', valueName: 'glob', help: 'Count matching files as docs.' },
  tests: { kind: 'list', valueName: 'glob', help: 'Count matching files as tests.' },
  linguist: {
    kind: 'boolean',
    negatable: true,
    help: 'Ignore linguist attributes in .gitattributes.',
  },
  treeSitter: {
    kind: 'boolean',
    help: 'Read TypeScript, JavaScript, Rust, Python, Scala, Go, Java, C, C++, C#, Ruby, PHP and Bash with tree-sitter (needs web-tree-sitter and the grammar packages).',
  },
} as const satisfies FlagSpec

function groupRules(values: {
  [G in (typeof RULE_GROUPS)[number]]: string[] | undefined
}): GroupRules {
  return Object.fromEntries(
    RULE_GROUPS.flatMap((g) => (values[g] === undefined ? [] : [[g, values[g]]])),
  ) as GroupRules
}

const printJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

const NEEDS_GIT_HINT =
  'diff, compare, describe, prep and count --rev read git history; count without --rev reads the files on disk and needs no git.'

/** A classified failure as a thrown error; cli-tool's `failureOf` reads its `failure`. */
class ClassifiedError extends Error {
  readonly failure: Failure
  constructor(failure: Failure) {
    super(failure.message)
    this.name = 'ClassifiedError'
    this.failure = failure
  }
}

/**
 * What the app reports for a {@link CodeStatsError}: a usage error (exit 2)
 * for bad input; else the classified failure behind it, which the app prints
 * as one line and exits with its shared code (a missing tool, a signed-out
 * gh, no repository); else a plain error (exit 1). A `needs-git` error adds a
 * second line saying which commands need git. The app removes terminal
 * controls from every line, so git's or gh's text cannot drive the terminal.
 */
function appError(e: CodeStatsError): Error {
  if (e.kind === 'bad-input') return new UsageError(e.message)
  const failure = e.failure === null ? null : { ...e.failure, message: e.message }
  if (e.kind === 'needs-git') {
    // The failure's own line, as the app prints a failure, then the hint line.
    const line =
      failure?.hint === undefined || failure.hint === ''
        ? e.message
        : `${e.message} ${failure.hint}`
    return new CommandError(line, {
      hint: NEEDS_GIT_HINT,
      ...(failure === null ? {} : { exit: exitCodeFor(failure), code: failure.kind }),
    })
  }
  return failure === null ? new CommandError(e.message) : new ClassifiedError(failure)
}

/** Runs a command's body, turning a {@link CodeStatsError} into the error the app reports. */
export async function guarded<T>(body: () => T | Promise<T>): Promise<T> {
  try {
    return await body()
  } catch (e) {
    if (e instanceof CodeStatsError) throw appError(e)
    throw e
  }
}

const texts = new WeakMap<object, string>()

/**
 * `output`, with its text form worked out now when the answer is text, since
 * the text depends on flags (`--detail`) the app's `text` hook is not given.
 */
export function answer<T extends object>(ctx: CommandContext, output: T, text: () => string): T {
  if (!ctx.json) texts.set(output, text())
  return output
}

/** The text form {@link answer} recorded for `output`, else `output` as JSON. */
export const textOf = (output: object): string => texts.get(output) ?? printJson(output)

/**
 * The options every command passes on: the working directory, runners,
 * linguist switch, group rules and, with `--tree-sitter`, the registry.
 */
export async function commonOptions(
  values: FlagValues<typeof COMMON_FLAGS>,
  ctx: CommandContext,
  runners: Runners,
): Promise<{
  cwd: string
  runners: Runners
  linguist: boolean
  groups: GroupRules
  registry?: ScannerRegistry
}> {
  return {
    cwd: ctx.cwd,
    runners,
    linguist: values.linguist,
    groups: groupRules(values),
    ...(await registryOption(values.treeSitter, ctx)),
  }
}

/**
 * The change `diff` and `describe` measure: `--worktree` (with a ref, from
 * its merge base with HEAD), a named change, or none for the branch against
 * the remote's default branch; and the PR `--write` writes to, or null
 * without `--write`. `--worktree` with a PR or a revision pair, or `--write`
 * without a PR, is a usage error.
 */
export function changeSpecOf(
  values: { worktree: boolean; write: boolean },
  named: string | undefined,
): { spec: ChangeSpec | null; writeTo: number | null } {
  const parsed = named === undefined ? null : parseChangeSpec(named)
  let spec: ChangeSpec | null = parsed
  if (values.worktree) {
    // A lone ref parses as `ref...HEAD`; with --worktree it is the base the working tree is read from.
    const lone = parsed?.kind === 'merge-base' && parsed.head === 'HEAD' && !named!.includes('..')
    if (parsed !== null && !lone) {
      throw new CodeStatsError('--worktree takes a base ref, not a PR or a revision pair', {
        kind: 'bad-input',
      })
    }
    spec = changeSpecFrom({ worktree: true, base: lone ? parsed.base : null })
  }
  if (!values.write) return { spec, writeTo: null }
  if (spec?.kind !== 'pr') {
    throw new CodeStatsError('--write needs a PR number', { kind: 'bad-input' })
  }
  return { spec, writeTo: spec.number }
}

/**
 * Says on stderr whether `--write` changed PR `pr`'s body: it wrote
 * `what.wrote`, or the PR already held `what.held`.
 */
export function reportWrite(
  ctx: CommandContext,
  pr: number,
  wrote: boolean,
  what: { wrote: string; held: string },
): void {
  ctx.note(wrote ? `wrote ${what.wrote} into PR #${pr}` : `PR #${pr} already holds ${what.held}`)
}

/**
 * `{ registry }` over the tree-sitter scanners when `--tree-sitter` asks for
 * them, else `{}`. A missing grammar is a warning, not fatal: the table reads
 * those files.
 */
async function registryOption(
  treeSitter: boolean,
  ctx: CommandContext,
): Promise<{ registry?: ScannerRegistry }> {
  if (!treeSitter) return {}
  const { scanners, missing, failed } = await createTreeSitterScanners({ resolveFrom: ctx.cwd })
  const unread = [...missing, ...failed.map((f) => `${f.id} (${f.reason})`)]
  if (unread.length > 0) {
    ctx.warn(`no tree-sitter grammar for ${unread.join(', ')}; the table reads those`)
  }
  return { registry: createScannerRegistry({ scanners }) }
}
