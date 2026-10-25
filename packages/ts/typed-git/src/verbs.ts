/**
 * The verb table — every git invocation this library knows, as data.
 *
 * A {@link GitVerb} pairs the argv to run with the exit codes that mean
 * "absent" for that invocation and the function that reads the result.
 * Nothing here spawns anything, so the same definitions drive the synchronous
 * `Git` client and the asynchronous CLI backend. Adding a verb means adding it
 * here once.
 *
 * {@link gate} is the single place a git result becomes either a value or a
 * thrown failure. Both clients call it, so they cannot disagree.
 *
 * `GitVerb` and `gate` are internal: the package entries do not export them.
 */

import { CommandFailed, type CommandResult } from '@osdlc/command-seam'

import { gitFailureError } from './failure.ts'

/**
 * One git invocation: what to run, which exits are answers, and how to read
 * what came back.
 */
export interface GitVerb<T> {
  argv: string[]
  /** Written to the child's stdin when set. */
  input?: string | undefined
  /**
   * Environment entries the verb needs, set over the client's and the call's
   * `env`. The integration verbs set `LC_ALL=C` here so their parsers read
   * English git output.
   */
  env?: Readonly<Record<string, string>> | undefined
  /**
   * Exit codes that mean "asked and answered: not there" for this verb — not
   * "git failed". `config --get` exits 1 for an unset key, `cat-file -e` exits
   * 1 for a missing object. Those codes reach {@link GitVerb.parse}, which
   * turns them into the verb's absence value; any other non-zero exit throws.
   *
   * A mutation declares `[]`: nothing about a failed `push` is an answer.
   * The exceptions are `configRemoveSection` (no such section) and
   * `pushPorcelain` (a rejected ref). That is the whole checked/unchecked
   * distinction, so there is no `checked` flag to contradict it.
   */
  absent: readonly number[]
  /**
   * `argv` is the invocation that produced `result` — the verb's own argv
   * behind whatever repository binding the client added. A parse that raises
   * its own {@link CommandFailed} must report that, not {@link GitVerb.argv},
   * so every failure names the command that ran.
   */
  parse(result: CommandResult, argv: string[]): T
}

/**
 * Turn one git result into a value or a thrown failure: a `FailureError`
 * carrying the classified `GitFailure`, whose `cause` is the `CommandFailed`.
 *
 * The one place the library throws on an exit code, shared by both clients so
 * they cannot disagree. A parse can raise its own `CommandFailed` for output
 * it cannot read (`aheadBehind`, the integration verbs); it is handed the same
 * argv this reports. The `CommandFailed` is the `failure.cause`; a caller
 * that must tell which git call failed reads `e.failure.argv`.
 *
 * `argv` overrides what the error reports. Both clients pass the argv they
 * actually ran, so a failure from a repository-bound client names its store.
 *
 * A result the seam flagged `neverExited` — `git` missing from PATH, a
 * timeout kill, an abort — is a failure whatever the verb declares: its
 * `exitCode` is the seam's stand-in `1`, and 1 is the absence code of half
 * this table (`configGet`, `resolveRef`, `mergeBase`, `checkIgnore`,
 * `isAncestor`, `grep`, `revParse`). Read as an absence it would answer "no
 * such key / ref / match" for a git that never ran.
 *
 * A result flagged `outputIncomplete` is a failure too. The child exited, but
 * the runner stopped reading at the output cap (`maxOutputBytes`) or at a
 * timeout, so a parse would read cut-short output as the whole answer.
 */
export function gate<T>(verb: GitVerb<T>, result: CommandResult, argv?: string[]): T {
  try {
    if (
      result.neverExited ||
      result.outputIncomplete ||
      (result.exitCode !== 0 && !verb.absent.includes(result.exitCode))
    ) {
      throw new CommandFailed(argv ?? verb.argv, result)
    }
    return verb.parse(result, argv ?? verb.argv)
  } catch (error) {
    // Throw the classified failure, for a parse's own `CommandFailed` too.
    // Its `cause` is the `CommandFailed`.
    throw gitFailureError(error)
  }
}

/**
 * A client-level environment bag under a per-call one, or `undefined` when
 * neither is set (so the runner inherits the parent environment untouched
 * rather than being handed an empty object).
 *
 * Shared by `Git` and `cliBackend` so the precedence rule has one definition.
 */
export function mergeEnv(
  base: Record<string, string> | undefined,
  call: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (base === undefined) return call
  if (call === undefined) return base
  return { ...base, ...call }
}

/**
 * Split a variadic `revParse` call into its string args and a trailing
 * options object, when there is one. Shared by `Git` and `AsyncGit`.
 */
export function splitTrailingOptions<O extends object>(
  args: ReadonlyArray<string | O>,
): [string[], O] {
  const last = args[args.length - 1]
  if (last !== undefined && typeof last !== 'string') {
    return [args.slice(0, -1) as string[], last]
  }
  return [args as string[], {} as O]
}

/**
 * The `--git-dir=` / `--work-tree=` flags that bind an invocation to one
 * repository, or `[]` when neither is set. Shared by `Git` and `cliBackend`.
 */
export function repoPrefix(gitDir: string | undefined, workTree: string | undefined): string[] {
  const prefix: string[] = []
  if (gitDir !== undefined) prefix.push(`--git-dir=${gitDir}`)
  if (workTree !== undefined) prefix.push(`--work-tree=${workTree}`)
  return prefix
}

/** One row of `git worktree list --porcelain`. */
export interface Worktree {
  /** Absolute path of the worktree. */
  path: string
  /** HEAD sha, or null for an entry that reports none (a bare store). */
  head: string | null
  /** Checked-out branch shortname, or null when detached. */
  branch: string | null
  detached: boolean
  /**
   * The entry is a bare repository — git printed a literal `bare` line for it.
   *
   * Read from that line rather than inferred from `head === null`: an
   * unborn-HEAD checkout reports `HEAD 0000000000000000000000000000000000000000`,
   * and a prunable entry keeps the HEAD it had.
   */
  bare: boolean
  /** `git worktree lock` was run on the entry; `prune` skips it and `remove` refuses it. */
  locked: boolean
  /**
   * The reason given to `git worktree lock --reason`, or null when none was.
   * Verbatim porcelain: git C-quotes a reason holding a newline or other
   * special characters, and the quotes stay.
   */
  lockReason: string | null
}

/** One row of `git ls-remote`. */
export interface RemoteRef {
  sha: string
  ref: string
}

/** One row of a `--name-status` diff. */
export interface DiffEntry {
  /**
   * The status token, verbatim: `M`, `A`, `D`, and the similarity-scored
   * `R100` / `C085` a rename or copy carries. A caller that wants the letter
   * writes `status[0]`; a truncating library would lose the score for good.
   */
  status: string
  /**
   * The path the status is about. For a rename or copy, the destination —
   * where the file is now.
   */
  path: string
  /**
   * The source path of a rename or copy, and absent on every other status.
   *
   * An `R`/`C` record is three fields, so the source is there to report.
   * Present iff `status` starts with `R` or `C`.
   */
  from?: string
}

// ── parse helpers ───────────────────────────────────────────────────────────

// A parser only ever sees exit 0 or one of the verb's declared `absent` codes
// — the gate has already rejected everything else — so a non-zero exit here
// means absence, never failure.

/** Trimmed stdout, or null on a declared absence or an empty result. */
function trimmedOrNull(r: CommandResult): string | null {
  if (r.exitCode !== 0) return null
  const out = r.stdout.trim()
  return out === '' ? null : out
}

/** Non-blank lines of a command's stdout, verbatim. */
export function splitLines(out: string): string[] {
  return out.split('\n').filter((l) => l.trim() !== '')
}

/** Non-blank stdout lines, empty array on a declared absence. Verbatim. */
function lines(r: CommandResult): string[] {
  if (r.exitCode !== 0) return []
  return splitLines(r.stdout)
}

/** {@link lines}, with each line trimmed — for output that pads its values. */
function trimmedLines(r: CommandResult): string[] {
  return lines(r).map((l) => l.trim())
}

/**
 * NUL-separated fields, empties dropped — the parser for every `-z` verb.
 *
 * `-z` exists because git's default output quotes a path containing a space,
 * a quote or a non-ASCII byte (`"docs/a b.md"`), and a line-splitting caller
 * silently reads the quotes as part of the name. NUL has no such escape, so
 * this is the only split that is right for paths.
 */
function nulFields(r: CommandResult): string[] {
  return r.stdout.split('\x00').filter((f) => f !== '')
}

/**
 * `--name-status -z` records into {@link DiffEntry} rows.
 *
 * A plain record is two fields — `M \0 path` — but a rename or copy is three:
 * `R100 \0 oldPath \0 newPath`. A parser that pairs fields two at a time
 * desynchronizes on the first rename and mislabels every record after it.
 * Shared with `diffTree`, which emits the same records.
 */
function nameStatusEntries(r: CommandResult): DiffEntry[] {
  const fields = nulFields(r)
  const out: DiffEntry[] = []
  for (let i = 0; i < fields.length;) {
    const status = fields[i]!
    // R/C carry a similarity score and both paths; the destination is at +2.
    const renamed = status.startsWith('R') || status.startsWith('C')
    const path = fields[i + (renamed ? 2 : 1)]
    if (path === undefined) break // truncated trailing record: no path to report
    // `from` is set only for R/C, so a plain record deep-equals `{status, path}`.
    out.push(renamed ? { status, path, from: fields[i + 1]! } : { status, path })
    i += renamed ? 3 : 2
  }
  return out
}

/** A mutation's result carries no value. */
function nothing(): void {}

/** No exit code is an answer here — the gate throws on any non-zero exit. */
const NONE: readonly number[] = []

/**
 * Refuse a ref, remote, URL, path, pattern or config-key positional that
 * starts with `-`.
 *
 * git reads such a value as an option. `--upload-pack=<cmd>` given as a remote
 * runs `<cmd>`. The check throws a `TypeError` before anything spawns, so
 * `try` and `soft` let it through. Write `./-name` for a path that starts with
 * `-`, and `@{-1}` for the previous branch.
 */
function positional(verb: string, param: string, value: string): string {
  if (value.startsWith('-')) {
    throw new TypeError(
      `typed-git: ${verb}: ${param} must not start with "-" (got ${JSON.stringify(value)})`,
    )
  }
  return value
}

/**
 * A config key for the `config` reads: {@link positional}, plus a section and
 * a name.
 *
 * git exits 1 for a key with no `.`, or one that starts or ends with `.`. That
 * is the code the reads take as "unset", so a typo would read as no value. The
 * check throws a `TypeError` instead, before anything spawns.
 */
function configKey(verb: string, key: string): string {
  positional(verb, 'key', key)
  if (!key.includes('.') || key.startsWith('.') || key.endsWith('.')) {
    throw new TypeError(
      `typed-git: ${verb}: key must be <section>.<name> (got ${JSON.stringify(key)})`,
    )
  }
  return key
}

/**
 * A `--depth` value, refused with a `TypeError` unless it is a positive safe
 * integer. git rejects the others too, but only after it runs.
 */
function depthArg(verb: string, depth: number): string {
  if (!Number.isSafeInteger(depth) || depth < 1) {
    throw new TypeError(
      `typed-git: ${verb}: depth must be a positive integer (got ${JSON.stringify(depth)})`,
    )
  }
  return `--depth=${depth}`
}

/** {@link positional}, for an optional value. */
function optionalPositional(
  verb: string,
  param: string,
  value: string | undefined,
): string | undefined {
  return value === undefined ? undefined : positional(verb, param, value)
}

/** The child env that makes git print English, whatever the caller's locale. */
const C_LOCALE: Readonly<Record<string, string>> = Object.freeze({ LC_ALL: 'C' })

// ── queries ─────────────────────────────────────────────────────────────────

/**
 * A file's content at a rev (`git show <rev>:<relPath>`), null if absent.
 *
 * `absent: [128]` is the closest git allows. git exits 128 both for "no such
 * path in that tree" and for "not a repository", so this verb cannot separate
 * absence from breakage.
 */
export function showAtRev(rev: string, relPath: string): GitVerb<string | null> {
  return {
    argv: ['show', `${positional('showAtRev', 'rev', rev)}:${relPath}`],
    absent: [128],
    // NOT trimmedOrNull: file content is returned verbatim, trailing newline
    // included, because a caller round-tripping a blob must get its bytes.
    parse: (r) => (r.exitCode === 0 ? r.stdout : null),
  }
}

/**
 * Trimmed `git rev-parse <args>` output, for a query no other verb covers.
 *
 * `absent: [1]`, the code `rev-parse --verify --quiet <ref>` returns for a ref
 * that does not resolve. {@link resolveRef} passes those flags for you; reach
 * for it rather than spelling them here.
 *
 * `absent: [1]` is about refs. For a non-ref query — `--is-inside-work-tree`,
 * `--show-toplevel`, `--git-common-dir` — git exits 128 outside a repository
 * and this throws rather than answering `null`. Use `git.try.revParse(...)`
 * with an explicit `!ok` branch, or {@link topLevel} / {@link gitCommonDir},
 * for which "not a repository" is the answer.
 */
export function revParse(...args: string[]): GitVerb<string | null> {
  return { argv: ['rev-parse', ...args], absent: [1], parse: trimmedOrNull }
}

/**
 * The sha `ref` resolves to (`rev-parse --verify --quiet`), or null when it
 * does not resolve.
 *
 * `absent: [1]` — an unborn HEAD, a branch that does not exist, a tag that was
 * never fetched. An unreadable store exits 128 and throws, so absence stays
 * separable from breakage. That is why `resolveRef("HEAD")` is the way to check
 * that a repository is readable. {@link objectExists} is not; see there.
 */
export function resolveRef(ref: string): GitVerb<string | null> {
  return {
    argv: ['rev-parse', '--verify', '--quiet', positional('resolveRef', 'ref', ref)],
    absent: [1],
    parse: trimmedOrNull,
  }
}

/**
 * HEAD's shortname (`rev-parse --abbrev-ref HEAD`).
 *
 * Reports the literal string `"HEAD"` on a detached HEAD, where
 * {@link currentBranch} reports `null`. Pick by what the caller wants to
 * print: a name that is always a string, or a branch or nothing.
 *
 * `absent: []` — an unborn HEAD exits 128, as does a non-repository, so both
 * throw.
 */
export function headRef(): GitVerb<string | null> {
  return {
    argv: ['rev-parse', '--abbrev-ref', 'HEAD'],
    absent: NONE,
    parse: trimmedOrNull,
  }
}

/**
 * Absolute repo top-level directory, or null outside a repo.
 *
 * `absent: [128]`: for this question "not a repository" is a real answer,
 * so `if (!git.topLevel())` is the usual "am I in a repo?" check. Most
 * other verbs throw there — see {@link lsFiles}.
 */
export function topLevel(): GitVerb<string | null> {
  return { argv: ['rev-parse', '--show-toplevel'], absent: [128], parse: trimmedOrNull }
}

/**
 * The shared `.git` dir (worktree-aware) as an absolute path, or null outside
 * a repo.
 *
 * `--path-format=absolute` is passed for you: bare `--git-common-dir` answers
 * relative to the cwd — literally `.git` from a primary checkout — which a
 * caller then has to re-anchor.
 *
 * "Not a repository" is an answer here (`absent: [128]`); a variadic
 * `revParse("--git-common-dir")` throws there. Reach for this verb.
 */
export function gitCommonDir(): GitVerb<string | null> {
  return {
    argv: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    absent: [128],
    parse: trimmedOrNull,
  }
}

/**
 * This worktree's own `.git` dir as an absolute path, or null outside a repo
 * (`rev-parse --absolute-git-dir`).
 *
 * In a linked worktree it is `<common>/worktrees/<name>`, not the shared dir
 * {@link gitCommonDir} gives. Per-worktree state lives here: a rebase in
 * progress is a `rebase-merge` or `rebase-apply` directory in it.
 *
 * `absent: [128]`, as for {@link gitCommonDir}: "not a repository" is an answer.
 */
export function gitDir(): GitVerb<string | null> {
  return { argv: ['rev-parse', '--absolute-git-dir'], absent: [128], parse: trimmedOrNull }
}

/**
 * The full refname a symbolic ref points at, or null when it is not one.
 *
 * `absent: [128]` because "not a symbolic ref" is the common, meaningful
 * answer, not a failure: `refs/remotes/<remote>/HEAD` is unset in any clone
 * made before the remote had a default branch, and in every repository whose
 * remote HEAD was never fetched. A caller asking for a default branch handles
 * the null by probing instead.
 *
 * A caller wanting the branch name strips the `refs/remotes/<remote>/` prefix
 * rather than taking the last segment: the name may contain slashes.
 */
export function symbolicRef(ref: string): GitVerb<string | null> {
  return {
    argv: ['symbolic-ref', positional('symbolicRef', 'ref', ref)],
    absent: [128],
    parse: trimmedOrNull,
  }
}

/**
 * Current branch shortname, or null when detached.
 *
 * `absent: []` — a detached HEAD and an empty repo both exit 0 with empty
 * stdout, so absence never needs an exit code here. Outside a repo git exits
 * 128, which throws. {@link headRef} is the variant that prints `"HEAD"` when
 * detached instead of answering `null`.
 */
export function currentBranch(): GitVerb<string | null> {
  return { argv: ['branch', '--show-current'], absent: NONE, parse: trimmedOrNull }
}

/** Options for {@link statusPorcelain}. */
export interface StatusPorcelainOptions {
  /**
   * Pathspecs, passed after `--`. Narrows the report to one subtree.
   */
  paths?: string[] | undefined
}

/**
 * `git status --porcelain` lines; empty array on a clean tree, and a throw
 * outside a repository (exit 128).
 *
 * Verbatim: the first two columns are the status, so ` M f.ts` (unstaged
 * modification) must not be trimmed down to `M f.ts` (staged one).
 */
export function statusPorcelain(opts: StatusPorcelainOptions = {}): GitVerb<string[]> {
  const argv = ['status', '--porcelain']
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return {
    argv,
    absent: NONE,
    // A CRLF-terminated line keeps no stray \r for callers to strip.
    parse: (r) => lines(r).map((l) => l.replace(/\r$/, '')),
  }
}

/** One `git status --porcelain -z` record. */
export interface StatusEntry {
  /** Index status column. */
  x: string
  /** Worktree status column. */
  y: string
  /** The path; for a rename or copy, the destination. */
  path: string
}

/**
 * Every changed or untracked file as a {@link StatusEntry}
 * (`git status --porcelain -z --untracked-files=all`). Untracked directories
 * are expanded to their files. Paths are verbatim, never quoted, and a rename
 * or copy yields one entry (its source path is dropped). Empty on a clean
 * tree; throws outside a repository.
 */
export function statusEntries(): GitVerb<StatusEntry[]> {
  return {
    argv: ['status', '--porcelain', '-z', '--untracked-files=all'],
    absent: NONE,
    parse(r) {
      const fields = nulFields(r)
      const out: StatusEntry[] = []
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i]!
        if (f.length < 4) continue
        const x = f[0]!
        out.push({ x, y: f[1]!, path: f.slice(3) })
        if (x === 'R' || x === 'C') i++
      }
      return out
    },
  }
}

/** Local branch shortnames matching `pattern` (all when omitted). */
export function branches(pattern?: string | undefined): GitVerb<string[]> {
  const argv = ['branch', '--list', '--format=%(refname:short)']
  if (pattern !== undefined) argv.push(positional('branches', 'pattern', pattern))
  return { argv, absent: NONE, parse: trimmedLines }
}

/** `git worktree list --porcelain`, parsed. Throws outside a repository. */
export function worktrees(): GitVerb<Worktree[]> {
  return {
    argv: ['worktree', 'list', '--porcelain'],
    absent: NONE,
    parse(r) {
      const out: Worktree[] = []
      let cur: Partial<Worktree> | null = null
      const flush = () => {
        if (cur?.path !== undefined) {
          out.push({
            path: cur.path,
            head: cur.head ?? null,
            branch: cur.branch ?? null,
            detached: cur.detached ?? false,
            bare: cur.bare ?? false,
            locked: cur.locked ?? false,
            lockReason: cur.lockReason ?? null,
          })
        }
      }
      for (const line of r.stdout.split('\n')) {
        if (line.startsWith('worktree ')) {
          flush()
          cur = { path: line.slice('worktree '.length) }
        } else if (cur !== null && line.startsWith('HEAD ')) {
          cur.head = line.slice('HEAD '.length)
        } else if (cur !== null && line.startsWith('branch ')) {
          cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
        } else if (cur !== null && line === 'detached') {
          cur.detached = true
        } else if (cur !== null && line === 'bare') {
          cur.bare = true
        } else if (cur !== null && (line === 'locked' || line.startsWith('locked '))) {
          cur.locked = true
          cur.lockReason = line.slice('locked '.length) || null
        }
      }
      flush()
      return out
    },
  }
}

/**
 * Merge base of two revs, or null when the two histories are unrelated
 * (exit 1). A rev that does not resolve exits 128 and throws.
 */
export function mergeBase(a: string, b: string): GitVerb<string | null> {
  return {
    argv: ['merge-base', positional('mergeBase', 'a', a), positional('mergeBase', 'b', b)],
    absent: [1],
    parse: trimmedOrNull,
  }
}

/**
 * Subject line of a ref's HEAD commit (`log -1 --format=%s`), or null.
 *
 * `absent: [128]`, which git also uses for a broken repository — the same
 * overload as {@link showAtRev}. A caller that must tell an empty history from
 * a broken one probes {@link resolveRef} with `HEAD` first.
 */
export function logSubject(ref: string): GitVerb<string | null> {
  return {
    argv: ['log', '-1', '--format=%s', positional('logSubject', 'ref', ref)],
    absent: [128],
    parse(r) {
      if (r.exitCode !== 0) return null
      // Only trailing newlines: a subject's own leading whitespace is content.
      const out = r.stdout.replace(/\n+$/, '')
      return out === '' ? null : out
    },
  }
}

/** Which config file a `config` verb reads or writes. */
export type ConfigScope = 'local' | 'global' | 'system'

/** Options for {@link configGet}, {@link configGetAll} and {@link configGetBool}. */
export interface ConfigGetOptions {
  /**
   * Read one file only. Omitted means every file git reads, the last value
   * winning. `local` outside a repository exits 128 and throws.
   */
  scope?: ConfigScope | undefined
}

/** The `config` read argv: the scope flag when one is given, the flags, the checked key. */
function configRead(flags: string[], key: string, opts: ConfigGetOptions): string[] {
  const argv = ['config']
  if (opts.scope !== undefined) argv.push(`--${opts.scope}`)
  argv.push(...flags, key)
  return argv
}

/** `git config --get <key>`, or null when unset (exit 1). */
export function configGet(key: string, opts: ConfigGetOptions = {}): GitVerb<string | null> {
  return {
    argv: configRead(['--get'], configKey('configGet', key), opts),
    absent: [1],
    parse: trimmedOrNull,
  }
}

/**
 * Every value of a multi-valued key (`git config --get-all -z <key>`), in the
 * order git reads them. `[]` when the key is unset (exit 1).
 *
 * `-z` ends each value with NUL, so a value holding a newline stays whole and
 * an empty value is kept as `""`. Values are verbatim, not trimmed.
 */
export function configGetAll(key: string, opts: ConfigGetOptions = {}): GitVerb<string[]> {
  return {
    argv: configRead(['--get-all', '-z'], configKey('configGetAll', key), opts),
    absent: [1],
    parse(r) {
      if (r.exitCode !== 0) return []
      // Each value ends with NUL, so the last field is always the empty tail.
      return r.stdout.split('\x00').slice(0, -1)
    },
  }
}

/**
 * A key read as a boolean (`git config --type=bool --get <key>`), or null when
 * unset (exit 1).
 *
 * git does the reading: `yes`, `on`, `1` and a bare key are `true`. A value
 * git cannot read as a boolean exits 128 and throws.
 */
export function configGetBool(key: string, opts: ConfigGetOptions = {}): GitVerb<boolean | null> {
  return {
    argv: configRead(['--type=bool', '--get'], configKey('configGetBool', key), opts),
    absent: [1],
    parse(r, ranArgv) {
      if (r.exitCode !== 0) return null
      const out = r.stdout.trim()
      if (out === 'true') return true
      if (out === 'false') return false
      throw new CommandFailed(ranArgv, r)
    },
  }
}

/**
 * True iff `rev` resolves to an object (`cat-file -e`).
 *
 * A predicate, so both of git's "no" codes are absence: 1 for a well-formed
 * name with no object behind it, 128 for a name it cannot even parse.
 *
 * That is right for a predicate, and it is why this verb cannot check that a
 * repository is readable. `false` here does not mean "no history": measured
 * against real stores, `cat-file -e HEAD` exits 128 on an empty repository, 1
 * on a dangling HEAD ref, and 128 again with the object directory removed — so
 * `objectExists("HEAD")` answers `false` for all three and folds a corrupt
 * store into "nothing here yet". Ask "does this repo have history?" with
 * `hasHistory()` ({@link resolveRef} on `HEAD`), which is `false` only for the
 * unborn case and throws when the store is unreadable.
 */
export function objectExists(rev: string): GitVerb<boolean> {
  return {
    argv: ['cat-file', '-e', positional('objectExists', 'rev', rev)],
    absent: [1, 128],
    parse: (r) => r.exitCode === 0,
  }
}

/** Options for {@link lsRemote}. */
export interface LsRemoteOptions {
  /** `--heads` — branches only. */
  heads?: boolean | undefined
  /** `--tags` — tags only. Set with `heads` to ask for both. */
  tags?: boolean | undefined
}

/**
 * `ls-remote` rows for a remote (optionally pattern- and kind-filtered).
 *
 * `absent: []` — a remote with no matching refs answers with exit 0 and no
 * output, so `[]` means "no refs". An unreachable remote exits 128 and throws.
 */
export function lsRemote(
  remote: string,
  pattern?: string | undefined,
  opts: LsRemoteOptions = {},
): GitVerb<RemoteRef[]> {
  const argv = ['ls-remote']
  if (opts.heads) argv.push('--heads')
  if (opts.tags) argv.push('--tags')
  argv.push(positional('lsRemote', 'remote', remote))
  if (pattern !== undefined) argv.push(positional('lsRemote', 'pattern', pattern))
  return {
    argv,
    absent: NONE,
    // Same sha-TAB-ref rows `for-each-ref` prints, so the same parser.
    parse: (r) => parseRefRows(splitLines(r.stdout)),
  }
}

/**
 * The subset of `relPaths` that .gitignore rules ignore
 * (`check-ignore --stdin -z`, NUL-delimited through the seam's `input`).
 *
 * `absent: [1]` — "none of these paths are ignored". Outside a repository git
 * exits 128 and this throws, so a caller cannot mistake "could not ask" for
 * "nothing is ignored".
 *
 * A fail-closed caller, such as a check deciding whether a path may be read
 * or published, must use `git.try.checkIgnore` with an explicit `!ok` branch
 * that refuses. It must neither let the thrown failure escape nor read it as
 * "not ignored":
 *
 * ```ts
 * const got = git.try.checkIgnore(paths);
 * if (!got.ok) return denyEverything(got.error); // could not ask ⇒ refuse
 * ```
 */
export function checkIgnore(relPaths: string[]): GitVerb<Set<string>> {
  return {
    argv: ['check-ignore', '--stdin', '-z'],
    input: relPaths.join('\x00') + '\x00',
    absent: [1],
    parse: (r) => new Set(r.stdout.split('\x00').filter((c) => c !== '')),
  }
}

/** One ignore rule that matched a path, as `git check-ignore -v` reports it. */
export interface IgnoreMatch {
  /** The path asked about, as given. */
  path: string
  /** The file holding the rule (a `.gitignore`, `.git/info/exclude`, or the global excludes file). */
  source: string
  /** 1-based line of the rule in `source`. */
  line: number
  /** The pattern as written; a leading `!` marks a negation, which un-ignores the path. */
  pattern: string
}

/**
 * The rule that decides each of `relPaths`, from `git check-ignore -v --stdin -z`. Paths no rule
 * mentions are omitted, and exit 1 (nothing matched) is an empty list. A negated pattern (`!x`)
 * is reported too: the path is then NOT ignored, so check `pattern` before treating a match as
 * "ignored". Like {@link checkIgnore} it throws outside a repository.
 */
export function checkIgnoreVerbose(relPaths: string[]): GitVerb<IgnoreMatch[]> {
  return {
    argv: ['check-ignore', '-v', '--stdin', '-z'],
    input: relPaths.join('\x00') + '\x00',
    absent: [1],
    parse: (r) => {
      // -z output is four NUL-terminated fields per match: source, line, pattern, path.
      const f = r.stdout.split('\x00')
      const out: IgnoreMatch[] = []
      for (let i = 0; i + 3 < f.length; i += 4) {
        out.push({ source: f[i]!, line: Number(f[i + 1]), pattern: f[i + 2]!, path: f[i + 3]! })
      }
      return out
    },
  }
}

/** Options for {@link lsFiles}. */
export interface LsFilesOptions {
  /** `--cached` — files in the index. */
  cached?: boolean | undefined
  /** `--others` — files git is not tracking. */
  others?: boolean | undefined
  /** `--exclude-standard` — apply .gitignore and friends. */
  excludeStandard?: boolean | undefined
  /** `--directory` — list a wholly untracked directory once, as `dir/`. */
  directory?: boolean | undefined
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/**
 * Tracked and/or untracked file paths (`git ls-files -z`).
 *
 * `absent: []` — no matching files is exit 0 with empty stdout, so `[]` means
 * "none". Outside a repository git exits 128 and this throws: a check that
 * cannot read the index has not "found zero files to check".
 *
 * Note the difference from {@link topLevel}, which such checks often call on
 * the line before: `topLevel()` returns null outside a repository and this verb
 * throws there. Both are correct — "not a repository" answers "where is the
 * root?" but not "which files are here?" — but a reader who assumes the two
 * behave alike writes `if (!git.topLevel()) return; git.lsFiles()` and is not
 * protected. Only a `try` / catch is.
 */
export function lsFiles(opts: LsFilesOptions = {}): GitVerb<string[]> {
  const argv = ['ls-files', '-z']
  if (opts.cached) argv.push('--cached')
  if (opts.others) argv.push('--others')
  if (opts.excludeStandard) argv.push('--exclude-standard')
  if (opts.directory) argv.push('--directory')
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return { argv, absent: NONE, parse: nulFields }
}

/** One row of `git ls-files -v`. */
export interface TaggedFile {
  /**
   * The status tag, verbatim: `H` for an ordinary tracked file, `S` for
   * skip-worktree, and a lowercase letter for assume-unchanged.
   */
  tag: string
  path: string
}

/**
 * Tracked files with their status tag (`git ls-files -v -z`).
 *
 * The tag is the only place git shows the skip-worktree and assume-unchanged
 * flags; `status` hides edits to flagged files. Throws outside a repository,
 * as {@link lsFiles} does.
 */
export function lsFilesTagged(): GitVerb<TaggedFile[]> {
  return {
    argv: ['ls-files', '-v', '-z'],
    absent: NONE,
    parse(r) {
      const rows: TaggedFile[] = []
      for (const chunk of r.stdout.split('\x00')) {
        if (chunk.length < 3 || chunk[1] !== ' ') continue
        rows.push({ tag: chunk[0]!, path: chunk.slice(2) })
      }
      return rows
    },
  }
}

/** Options for {@link forEachRef}. */
export interface ForEachRefOptions {
  /** `--format=` value; defaults to `%(objectname)%09%(refname)`. */
  format?: string | undefined
  /** `--sort=` key, e.g. `-committerdate`. */
  sort?: string | undefined
  /** `--count=` cap on the rows returned. */
  count?: number | undefined
}

/** The `forEachRef` format {@link refs} parses: sha, TAB, full refname. */
export const REF_FORMAT = '%(objectname)%09%(refname)'

/**
 * `git for-each-ref` rows, one per line, verbatim.
 *
 * `absent: []` — a pattern matching nothing is exit 0 with empty stdout, so
 * `[]` means "no such refs". Outside a repository, and for an unknown format
 * or sort field, git exits 128 and this throws.
 *
 * Lines rather than parsed rows because the format is the caller's: the
 * default gives sha-TAB-refname, which {@link parseRefRows} splits.
 */
export function forEachRef(
  pattern: string | string[],
  opts: ForEachRefOptions = {},
): GitVerb<string[]> {
  const argv = ['for-each-ref', `--format=${opts.format ?? REF_FORMAT}`]
  if (opts.sort !== undefined) argv.push(`--sort=${opts.sort}`)
  if (opts.count !== undefined) argv.push(`--count=${opts.count}`)
  for (const p of typeof pattern === 'string' ? [pattern] : pattern) {
    argv.push(positional('forEachRef', 'pattern', p))
  }
  return { argv, absent: NONE, parse: lines }
}

/**
 * {@link forEachRef} rows in the default format, split into `{ sha, ref }`.
 *
 * Split at the first tab: a refname cannot contain one, but a caller-chosen
 * format could, and splitting on every tab would silently truncate.
 */
export function parseRefRows(rows: string[]): RemoteRef[] {
  const out: RemoteRef[] = []
  for (const row of rows) {
    const tab = row.indexOf('\t')
    if (tab <= 0) continue
    out.push({ sha: row.slice(0, tab), ref: row.slice(tab + 1) })
  }
  return out
}

/** Options for {@link diffNameOnly}. */
export interface DiffNameOnlyOptions {
  /** `--cached` — diff the index against HEAD rather than the worktree. */
  cached?: boolean | undefined
  /** `--diff-filter=` selector, e.g. `ACMR`. */
  diffFilter?: string | undefined
  /**
   * The diff range, as argv tokens rather than one string: the two-dot form is
   * two tokens (`[base, "HEAD"]`) and the three-dot form is one
   * (`["base...HEAD"]`), and callers need both spellings. Named `rangeArgs` to
   * keep `range` meaning a single token everywhere else.
   */
  rangeArgs?: string[] | undefined
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/**
 * Changed paths (`git diff --name-only -z`).
 *
 * `absent: []` — no changes is exit 0 with empty stdout, because this verb
 * never passes `--exit-code`. Outside a repository `git diff` exits **129**
 * (a usage error, not the 128 most git commands give); undeclared either way,
 * so it throws.
 */
export function diffNameOnly(opts: DiffNameOnlyOptions = {}): GitVerb<string[]> {
  const argv = ['diff', '--name-only', '-z']
  if (opts.cached) argv.push('--cached')
  if (opts.diffFilter !== undefined) argv.push(`--diff-filter=${opts.diffFilter}`)
  for (const token of opts.rangeArgs ?? [])
    argv.push(positional('diffNameOnly', 'rangeArgs', token))
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return { argv, absent: NONE, parse: nulFields }
}

/** Options for {@link diffStat}. */
export interface DiffStatOptions {
  /** The diff range as argv tokens, as in {@link DiffNameOnlyOptions.rangeArgs}. */
  rangeArgs?: string[] | undefined
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/**
 * The per-file change summary (`git diff --stat`), as raw stdout; empty when
 * nothing changed. A rev that does not resolve throws.
 */
export function diffStat(opts: DiffStatOptions = {}): GitVerb<string> {
  const argv = ['diff', '--stat']
  for (const token of opts.rangeArgs ?? []) argv.push(positional('diffStat', 'rangeArgs', token))
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return { argv, absent: NONE, parse: (r) => r.stdout }
}

/** Result of {@link diffCheck}. */
export interface DiffCheckResult {
  /** True when the diff has no whitespace errors or conflict markers. */
  ok: boolean
  /** git's report of the offending lines; empty when `ok`. */
  output: string
}

/** Options for {@link diffCheck}. */
export interface DiffCheckOptions {
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/**
 * `git diff --check`: whitespace errors and leftover conflict markers in the
 * unstaged changes. `absent: [1, 2]` — git signals findings through its exit
 * code (2 on current git), so they are an answer, not a failure.
 */
export function diffCheck(opts: DiffCheckOptions = {}): GitVerb<DiffCheckResult> {
  const argv = ['diff', '--check']
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return {
    argv,
    absent: [1, 2],
    parse: (r) => ({ ok: r.exitCode === 0, output: r.stdout }),
  }
}

/** Options for {@link diffNameStatus}. */
export interface DiffNameStatusOptions {
  /** `--cached` — diff the index against HEAD rather than the worktree. */
  cached?: boolean | undefined
  /** The diff range as a single token, e.g. `origin/main..HEAD`. */
  range?: string | undefined
  /** `--no-renames` — report a rename as a delete plus an add. */
  noRenames?: boolean | undefined
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/**
 * Changed paths with their status (`git diff --name-status -z`).
 *
 * `absent: []` — no changes is exit 0 with empty stdout, including before the
 * first commit, where `--cached` diffs against the empty tree. Outside a
 * repository `git diff` exits 129 and this throws.
 *
 * See {@link DiffEntry} for what a rename record costs a naive parser.
 */
export function diffNameStatus(opts: DiffNameStatusOptions = {}): GitVerb<DiffEntry[]> {
  const argv = ['diff', '--name-status', '-z']
  if (opts.cached) argv.push('--cached')
  if (opts.noRenames) argv.push('--no-renames')
  if (opts.range !== undefined) argv.push(positional('diffNameStatus', 'range', opts.range))
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return { argv, absent: NONE, parse: nameStatusEntries }
}

/** Options for {@link log}. */
export interface LogOptions {
  /** A single starting rev. */
  rev?: string | undefined
  /** A range expression as one token, e.g. `origin/main..HEAD`. */
  range?: string | undefined
  /**
   * The `--format=` value, caller-chosen and passed through verbatim.
   *
   * git reads a placeholder string as `tformat:`, which terminates each
   * record with a newline; pass `"format:%H…"` explicitly for the older
   * separator semantics, which a caller framing its own records with `%x1e`
   * usually wants.
   */
  format?: string | undefined
  /** `--max-count=`. */
  maxCount?: number | undefined
  /** `--no-merges`. */
  noMerges?: boolean | undefined
  /** `--reverse` — oldest first. */
  reverse?: boolean | undefined
  /** `--no-renames` — no rename detection in `nameStatus` / `numstat` output. */
  noRenames?: boolean | undefined
  /** `--name-status` — append each commit's changed paths and statuses. */
  nameStatus?: boolean | undefined
  /** `--numstat` — append each commit's per-file added/deleted line counts. */
  numstat?: boolean | undefined
  /** `--relative` — report paths relative to the client's cwd. */
  relative?: boolean | undefined
  /** Revs to exclude, emitted after `--not` (so after the positive revs). */
  notRefs?: string[] | undefined
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/**
 * `git log`, as raw stdout.
 *
 * Callers choose their own `--format`, and several frame their own records
 * with `%x1e` / `%x1f` separators or interleave `--name-status` blocks — so
 * the library returns the bytes and does not split them. A caller that wants
 * lines uses the client's `logLines`.
 *
 * `absent: []`, deliberately. An empty repository exits 128 — the same code a
 * corrupt one gives, and the same code as a rev that does not resolve — so
 * declaring 128 absent would hand back `""` for a broken store. A caller that
 * must tolerate an empty history probes `hasHistory()` first (not
 * `objectExists("HEAD")` — see {@link objectExists}), or uses `git.try.log()`.
 *
 * {@link logSubject} is the fixed-format convenience for the one question that
 * needs no format.
 */
export function log(opts: LogOptions = {}): GitVerb<string> {
  const argv = ['log']
  if (opts.format !== undefined) argv.push(`--format=${opts.format}`)
  if (opts.maxCount !== undefined) argv.push(`--max-count=${opts.maxCount}`)
  if (opts.noMerges) argv.push('--no-merges')
  if (opts.reverse) argv.push('--reverse')
  if (opts.noRenames) argv.push('--no-renames')
  if (opts.nameStatus) argv.push('--name-status')
  if (opts.numstat) argv.push('--numstat')
  if (opts.relative) argv.push('--relative')
  if (opts.rev !== undefined) argv.push(positional('log', 'rev', opts.rev))
  if (opts.range !== undefined) argv.push(positional('log', 'range', opts.range))
  // `--not` negates every rev after it, so the positive revs must precede it.
  if (opts.notRefs !== undefined && opts.notRefs.length > 0) {
    argv.push('--not', ...opts.notRefs.map((ref) => positional('log', 'notRefs', ref)))
  }
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  // Verbatim, trailing newline included: the caller's format decides where a
  // record ends, and trimming would eat the terminator it relies on.
  return { argv, absent: NONE, parse: (r) => r.stdout }
}

/** One row of `git ls-tree`. */
export interface TreeEntry {
  /** The six-digit mode, verbatim: `100644`, `100755`, `040000`, `160000`. */
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  /**
   * Blob size in bytes — set only under `long`, and only for a blob. `--long`
   * prints `-` for a tree or submodule, which reads back as `null` rather than
   * a fabricated zero.
   */
  sizeBytes: number | null
  path: string
}

/** Options for {@link lsTree}. */
export interface LsTreeOptions {
  /** `-r` — descend into subtrees, so only blobs come back. */
  recursive?: boolean | undefined
  /** `--long` — include each blob's size. */
  long?: boolean | undefined
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/**
 * The entries of a tree at a rev (`git ls-tree -z`).
 *
 * `absent: []` — a pathspec matching nothing is exit 0 with empty stdout, so
 * `[]` means "no such entries"; a rev that does not resolve exits 128 and
 * throws, so an unreadable rev cannot read as "the tree is empty".
 */
export function lsTree(rev: string, opts: LsTreeOptions = {}): GitVerb<TreeEntry[]> {
  const argv = ['ls-tree', '-z']
  if (opts.recursive) argv.push('-r')
  if (opts.long) argv.push('--long')
  argv.push(positional('lsTree', 'rev', rev))
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return {
    argv,
    absent: NONE,
    parse(r) {
      const out: TreeEntry[] = []
      for (const record of nulFields(r)) {
        // `<mode> <type> <sha>[ <size>]\t<path>` — the TAB is the only
        // separator that cannot appear in the metadata half, and a path may
        // contain spaces, so split there first and never on whitespace alone.
        const tab = record.indexOf('\t')
        if (tab < 0) continue
        const meta = record
          .slice(0, tab)
          .split(/\s+/)
          .filter((f) => f !== '')
        const [mode, type, sha, size] = meta
        if (mode === undefined || type === undefined || sha === undefined) continue
        out.push({
          mode,
          type: type as TreeEntry['type'],
          sha,
          // `--long` writes `-` where a size makes no sense (tree, submodule).
          sizeBytes: size === undefined || size === '-' ? null : Number(size),
          path: record.slice(tab + 1),
        })
      }
      return out
    },
  }
}

/** Options for {@link diffTree}. */
export interface DiffTreeOptions {
  /**
   * `--root` — report a root commit's contents as adds rather than nothing.
   *
   * Without it `diff-tree` on the first commit exits 0 with empty output,
   * because a root commit has no parent to diff against. A caller walking a
   * whole history and not passing this silently loses the first commit.
   */
  root?: boolean | undefined
  /** `--no-renames` — report a rename as a delete plus an add. */
  noRenames?: boolean | undefined
  /**
   * `-M` — detect renames. Plumbing `diff-tree` does not read `diff.renames`,
   * so without it a move is a delete plus an add. Read by `diffTree` only;
   * `diffTreeNumstat` ignores it.
   */
  findRenames?: boolean | undefined
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/** Options for {@link diffText}. */
export interface DiffTextOptions {
  /** `--cached` — diff the index against `rev` (or HEAD) rather than the worktree. */
  staged?: boolean | undefined
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/**
 * The unified diff text (`git diff [--cached] [rev] [-- paths]`), for the same
 * rev and staged shape {@link diffNameOnly} selects paths for. Empty when
 * nothing differs.
 *
 * `absent: []`. A rev that does not resolve exits 128, and outside a
 * repository `git diff` exits 129. Both throw, so "git failed" never reads as
 * "no diff". `git.try.diffText` reports them as `{ ok: false }`.
 */
export function diffText(rev?: string | undefined, opts: DiffTextOptions = {}): GitVerb<string> {
  const argv = ['diff']
  if (opts.staged === true) argv.push('--cached')
  const from = optionalPositional('diffText', 'rev', rev)
  if (from !== undefined) argv.push(from)
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return { argv, absent: NONE, parse: (r) => r.stdout }
}

/**
 * One untracked file rendered as an all-added diff
 * (`diff --no-index -- /dev/null <path>`), so a new file reaches a consumer in
 * the same shape as a modified one. An empty existing file still gives a diff
 * header.
 *
 * `--no-index` exits 1 whenever the inputs differ, which for a real file is
 * always, so exit 1 is the success case. git also exits 1, with empty stdout,
 * for a path it cannot read; that throws the classified failure. Exit 2 (a usage or
 * read error) throws too.
 */
export function diffAddedFile(relPath: string): GitVerb<string> {
  return {
    argv: ['diff', '--no-index', '--', '/dev/null', relPath],
    absent: [1],
    parse(r, ranArgv) {
      if (r.exitCode !== 0 && r.stdout === '') throw new CommandFailed(ranArgv, r)
      return r.stdout
    },
  }
}

/**
 * The paths and statuses one commit changed (`git diff-tree --name-status -z`).
 *
 * `diffNameStatus` for a commit rather than the worktree or index, sharing
 * that verb's parser and its {@link DiffEntry} rows. `--no-commit-id` keeps
 * the sha out of the records.
 *
 * `absent: []` — a rev that does not resolve exits 128 and throws.
 *
 * For per-file line counts use {@link diffTreeNumstat}: git rejects
 * `--numstat` together with `--name-status` (exit 129), so the two shapes are
 * two verbs.
 */
export function diffTree(rev: string, opts: DiffTreeOptions = {}): GitVerb<DiffEntry[]> {
  const argv = ['diff-tree', '-r', '--no-commit-id']
  if (opts.root) argv.push('--root')
  if (opts.noRenames) argv.push('--no-renames')
  if (opts.findRenames) argv.push('-M')
  argv.push('--name-status', '-z', positional('diffTree', 'rev', rev))
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return { argv, absent: NONE, parse: nameStatusEntries }
}

/** One row of a `--numstat` diff. */
export interface NumstatEntry {
  path: string
  /** Added lines, or null for a binary file, where git prints `-`. */
  linesAdded: number | null
  /** Deleted lines, or null for a binary file. */
  linesDeleted: number | null
}

/**
 * Per-file line counts for one commit (`git diff-tree --numstat -z`).
 *
 * The counting twin of {@link diffTree}, with the same options. A binary file
 * has no line counts: git prints `-` for both, which reads back as `null`.
 *
 * `absent: []` — a rev that does not resolve exits 128 and throws.
 */
export function diffTreeNumstat(rev: string, opts: DiffTreeOptions = {}): GitVerb<NumstatEntry[]> {
  const argv = ['diff-tree', '-r', '--no-commit-id']
  if (opts.root) argv.push('--root')
  if (opts.noRenames) argv.push('--no-renames')
  argv.push('--numstat', '-z', positional('diffTreeNumstat', 'rev', rev))
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return {
    argv,
    absent: NONE,
    parse(r) {
      const out: NumstatEntry[] = []
      for (const record of nulFields(r)) {
        // `<added>\t<deleted>\t<path>`: only the first two tabs separate, and
        // the rest of the record is the path — raw bytes, tabs included,
        // because `-z` turns off git's quoting. Splitting on every tab would
        // truncate a path that contains one.
        const firstTab = record.indexOf('\t')
        const secondTab = firstTab < 0 ? -1 : record.indexOf('\t', firstTab + 1)
        if (secondTab < 0) continue
        const added = record.slice(0, firstTab)
        const deleted = record.slice(firstTab + 1, secondTab)
        out.push({
          path: record.slice(secondTab + 1),
          linesAdded: added === '-' ? null : Number(added),
          linesDeleted: deleted === '-' ? null : Number(deleted),
        })
      }
      return out
    },
  }
}

/** Options for {@link grep}. */
export interface GrepOptions {
  /** `-E` — extended POSIX regular expressions. */
  extendedRegexp?: boolean | undefined
  /** `-n` — prefix each hit with its line number. */
  lineNumber?: boolean | undefined
  /** `--no-color` — never emit SGR escapes, whatever the config says. */
  noColor?: boolean | undefined
  /** Pathspecs, passed after `--`. */
  paths?: string[] | undefined
}

/**
 * Matching lines from the working tree (`git grep`), verbatim.
 *
 * `absent: [1]`: `git grep` exits 1 for "no matches", a legitimate answer. A
 * real failure is 128 (not a repository, an unbalanced regex) or 129 (a usage
 * error), and those throw.
 *
 * One limit: a pathspec that matches no file also exits 1, so a mistyped path
 * reads as "no matches" rather than as an error. git gives no way to tell the
 * two apart.
 *
 * Lines, not `-z`: the output is `path:line:text`, not a path listing, and `-z`
 * only changes the separator after the path — a caller still has to split the
 * record, and would then have to do it two different ways.
 */
export function grep(pattern: string, opts: GrepOptions = {}): GitVerb<string[]> {
  const argv = ['grep']
  if (opts.lineNumber) argv.push('-n')
  if (opts.extendedRegexp) argv.push('-E')
  if (opts.noColor) argv.push('--no-color')
  // `-e` marks the pattern as a pattern, so one that starts with `-` is searched for.
  argv.push('-e', pattern)
  if (opts.paths !== undefined && opts.paths.length > 0) argv.push('--', ...opts.paths)
  return { argv, absent: [1], parse: lines }
}

/**
 * True iff `a` is an ancestor of `b` (`git merge-base --is-ancestor`).
 *
 * A boolean carried entirely by the exit code. `absent: [1]` — measured: `b`
 * reachable from `a` → 0; a genuine "no", diverged or unrelated alike → 1; a
 * rev that does not resolve → **128, which throws**. A typo'd rev must never
 * read as "not an ancestor", because that answer is usually the one that lets
 * a caller delete something.
 */
export function isAncestor(a: string, b: string): GitVerb<boolean> {
  return {
    argv: [
      'merge-base',
      '--is-ancestor',
      positional('isAncestor', 'a', a),
      positional('isAncestor', 'b', b),
    ],
    absent: [1],
    parse: (r) => r.exitCode === 0,
  }
}

/** Commits each side of a fork point has that the other does not. */
export interface AheadBehind {
  /** Commits on `tip` that are not on `base`. */
  ahead: number
  /** Commits on `base` that are not on `tip`. */
  behind: number
}

/**
 * How far `tip` has diverged from `base`
 * (`git rev-list --left-right --count base...tip`).
 *
 * The verb owns the field order: git prints the left count first, and left is
 * `base` — so the first number is *behind*, not ahead.
 *
 * `absent: []` — unrelated histories are still a counted answer (exit 0); a
 * rev that does not resolve exits 128 and throws.
 */
export function aheadBehind(base: string, tip: string): GitVerb<AheadBehind> {
  positional('aheadBehind', 'tip', tip)
  const argv = [
    'rev-list',
    '--left-right',
    '--count',
    `${positional('aheadBehind', 'base', base)}...${tip}`,
  ]
  return {
    argv,
    absent: NONE,
    parse(r, ranArgv) {
      const m = /^(\d+)\s+(\d+)/.exec(r.stdout)
      // Exit 0 with output we cannot read is not an answer; reporting it as
      // 0/0 would be indistinguishable from "in sync", the one state a caller
      // acts on.
      if (m === null) throw new CommandFailed(ranArgv, r)
      return { behind: Number(m[1]), ahead: Number(m[2]) }
    },
  }
}

/**
 * Configured remote names (`git remote`). The clients call it as `remotes()`.
 *
 * `absent: []` — a repository with no remotes is exit 0 with empty stdout.
 * Outside a repository git exits 128 and this throws.
 */
export function remote(): GitVerb<string[]> {
  return { argv: ['remote'], absent: NONE, parse: trimmedLines }
}

/** Options for {@link remoteGetUrl} and {@link remoteGetUrls}. */
export interface RemoteGetUrlOptions {
  /**
   * `--push` — the push URL. git falls back to the fetch URL when the remote
   * sets no `pushurl`.
   */
  push?: boolean | undefined
}

/**
 * A remote's fetch URL (`git remote get-url <name>`), or null when no remote
 * by that name is configured. With `push`, its push URL. When a remote has
 * several URLs this is the first; {@link remoteGetUrls} gives them all.
 *
 * `absent: [2]` — measured: git reports an unknown remote as exit 2, not 1 or
 * 128. Outside a repository it exits 128 and this throws.
 */
export function remoteGetUrl(name: string, opts: RemoteGetUrlOptions = {}): GitVerb<string | null> {
  const argv = ['remote', 'get-url']
  if (opts.push) argv.push('--push')
  argv.push(positional('remoteGetUrl', 'name', name))
  return { argv, absent: [2], parse: trimmedOrNull }
}

/**
 * Every URL a remote has (`git remote get-url --all <name>`), or `[]` when no
 * remote by that name is configured (exit 2).
 *
 * A remote can carry several URLs (`remote set-url --add`). A caller that
 * checks a remote before deleting something compares all of them, not the
 * first.
 */
export function remoteGetUrls(name: string, opts: RemoteGetUrlOptions = {}): GitVerb<string[]> {
  const argv = ['remote', 'get-url', '--all']
  if (opts.push) argv.push('--push')
  argv.push(positional('remoteGetUrls', 'name', name))
  return { argv, absent: [2], parse: trimmedLines }
}

/**
 * The branch a remote's HEAD points at, as a full refname such as
 * `refs/heads/main` (`git ls-remote --symref <remote> HEAD`).
 *
 * It asks the remote over the network. {@link symbolicRef} on
 * `refs/remotes/<remote>/HEAD` reads the local copy instead, which a clone
 * may never have set.
 *
 * `absent: []`. null means the remote answered but names no default branch:
 * an empty repository, or a detached HEAD. An unreachable remote exits 128
 * and throws.
 */
export function remoteHead(remote: string): GitVerb<string | null> {
  return {
    argv: ['ls-remote', '--symref', positional('remoteHead', 'remote', remote), 'HEAD'],
    absent: NONE,
    parse(r) {
      // `ref: refs/heads/main<TAB>HEAD`, then the `<sha><TAB>HEAD` row.
      for (const line of splitLines(r.stdout)) {
        const m = /^ref: (\S+)\tHEAD$/.exec(line)
        if (m !== null) return m[1]!
      }
      return null
    },
  }
}

// ── mutations ───────────────────────────────────────────────────────────────
//
// absent: [], so any non-zero exit throws the classified failure.
// Two exceptions: `configRemoveSection` declares 128, and `pushPorcelain`
// declares 1 for a rejected ref.

/** Options for {@link fetch}. */
export interface FetchOptions {
  /** `--prune` — drop remote-tracking refs the remote no longer has. */
  prune?: boolean | undefined
  /** `--quiet` — suppress the progress report on stderr. */
  quiet?: boolean | undefined
  /**
   * `--no-write-fetch-head` — do not touch `.git/FETCH_HEAD`.
   *
   * The flag a fetch running beside other work wants: FETCH_HEAD is one file
   * per repository, so two concurrent fetches in the same store race over it
   * and a caller that only wanted refs updated gets a corrupted one.
   */
  noWriteFetchHead?: boolean | undefined
  /**
   * `--depth=<n>` — limit the fetched history to `n` commits from each tip.
   * Anything but a positive integer throws a `TypeError`.
   */
  depth?: number | undefined
  /** `--no-tags` — fetch no tags beyond those the refspecs name. */
  noTags?: boolean | undefined
}

/**
 * `git fetch <remote> [refspec…]`.
 *
 * `absent: []` — nothing about a failed fetch is an answer. A caller that
 * tolerates an unreachable remote uses `git.try.fetch(…)`.
 *
 * `refspec` takes an array, for fetching several refs in one invocation.
 */
export function fetch(
  remote: string,
  refspec?: string | string[] | undefined,
  opts: FetchOptions = {},
): GitVerb<void> {
  const argv = ['fetch']
  if (opts.quiet) argv.push('--quiet')
  if (opts.prune) argv.push('--prune')
  if (opts.noWriteFetchHead) argv.push('--no-write-fetch-head')
  if (opts.depth !== undefined) argv.push(depthArg('fetch', opts.depth))
  if (opts.noTags) argv.push('--no-tags')
  argv.push(positional('fetch', 'remote', remote))
  if (refspec !== undefined) {
    for (const spec of typeof refspec === 'string' ? [refspec] : refspec) {
      argv.push(positional('fetch', 'refspec', spec))
    }
  }
  return { argv, absent: NONE, parse: nothing }
}

/** Options for {@link add}. */
export interface AddOptions {
  /** `--all` — stage deletions and untracked files too, not just changes. */
  all?: boolean | undefined
  /** `--update` — stage changes and deletions to tracked files only. */
  update?: boolean | undefined
  /** `--intent-to-add` — record new files as empty so `git diff` lists them. */
  intentToAdd?: boolean | undefined
}

/** Stage paths. `--` precedes them, so a path starting with `-` is a path, not an option; flags go in `opts`. */
export function add(paths: string[], opts: AddOptions = {}): GitVerb<void> {
  const argv = ['add']
  if (opts.all) argv.push('--all')
  if (opts.update) argv.push('--update')
  if (opts.intentToAdd) argv.push('--intent-to-add')
  argv.push('--', ...paths)
  return { argv, absent: NONE, parse: nothing }
}

/** Flags shared by every {@link CommitOptions} message source. */
export interface CommitFlags {
  /** `--allow-empty` — commit even when nothing is staged. */
  allowEmpty?: boolean | undefined
  /** `--amend` — replace the previous commit rather than adding one. */
  amend?: boolean | undefined
  /** `--no-verify` — skip the commit hooks. */
  noVerify?: boolean | undefined
  /** `--signoff` — append a `Signed-off-by` trailer. */
  signoff?: boolean | undefined
}

/**
 * Options for {@link commit}. The message comes from exactly one source, and
 * the types refuse a mix: inline `-m` (`message`, optionally `body`), a file
 * (`messageFile`, `-F`), or a string fed on stdin (`messageStdin`, `-F -`).
 */
export type CommitOptions = CommitFlags &
  (
    | {
        /** The subject, as `-m`. */
        message?: string | undefined
        /** A second `-m`, rendered as the body after a blank line. */
        body?: string | undefined
        messageFile?: undefined
        messageStdin?: undefined
      }
    | {
        /** `-F <path>` — take the whole message from a file. */
        messageFile: string
        message?: undefined
        body?: undefined
        messageStdin?: undefined
      }
    | {
        /**
         * `-F -` — the whole message, fed on stdin through the runner's
         * `input`, so no temp file is needed. The bytes reach git unchanged
         * (git's default `whitespace` cleanup still applies, exactly as for a
         * file): a missing trailing newline is not added here, git adds it.
         */
        messageStdin: string
        message?: undefined
        body?: undefined
        messageFile?: undefined
      }
  )

/**
 * Commit with an inline message, a message file, or a stdin message (exactly
 * one source).
 *
 * `absent: []`. A failing commit hook is a failure, not an answer. Its output
 * goes to stdout, so a caller that must report it reads `e.failure.detail`,
 * which holds both streams, not stderr alone.
 */
export function commit(opts: CommitOptions): GitVerb<void> {
  const argv = ['commit']
  if (opts.allowEmpty) argv.push('--allow-empty')
  if (opts.amend) argv.push('--amend')
  if (opts.noVerify) argv.push('--no-verify')
  if (opts.signoff) argv.push('--signoff')
  if (opts.messageStdin !== undefined) {
    argv.push('-F', '-')
    return { argv, input: opts.messageStdin, absent: NONE, parse: nothing }
  }
  if (opts.messageFile !== undefined) argv.push('-F', opts.messageFile)
  else {
    argv.push('-m', opts.message ?? '')
    if (opts.body !== undefined) argv.push('-m', opts.body)
  }
  return { argv, absent: NONE, parse: nothing }
}

/** Options for {@link configSet}. */
export interface ConfigSetOptions {
  /**
   * Which file to write. Omitted means git's default: `--local` inside a
   * repository, something else outside one.
   */
  scope?: ConfigScope | undefined
}

/** `git config <key> <value>` — the write twin of {@link configGet}. */
export function configSet(key: string, value: string, opts: ConfigSetOptions = {}): GitVerb<void> {
  const argv = ['config']
  if (opts.scope !== undefined) argv.push(`--${opts.scope}`)
  argv.push(positional('configSet', 'key', key), value)
  return { argv, absent: NONE, parse: nothing }
}

/**
 * `git config --remove-section <name>`: true when removed, false when there was
 * no such section. `absent: [128]` also covers "not a repository", which git
 * spells the same way, so `false` can also mean git could not ask. It is a
 * mutation, so it has no `soft` form.
 */
export function configRemoveSection(name: string): GitVerb<boolean> {
  return {
    argv: ['config', '--remove-section', positional('configRemoveSection', 'name', name)],
    absent: [128],
    parse: (r) => r.exitCode === 0,
  }
}

/** Options for {@link init}. */
export interface InitOptions {
  /** `--bare` — a store with no working tree. */
  bare?: boolean | undefined
  /** `-b` — the initial branch name, rather than git's configured default. */
  initialBranch?: string | undefined
  /** `--quiet` — suppress the "Initialized empty repository" line. */
  quiet?: boolean | undefined
}

/**
 * `git init [path]`. `path` defaults to the client's `cwd`.
 *
 * Pass `initialBranch`: without it the branch name comes from the developer's
 * `init.defaultBranch`, so a fixture assuming `main` fails on some machines.
 */
export function init(path?: string | undefined, opts: InitOptions = {}): GitVerb<void> {
  const argv = ['init']
  if (opts.quiet) argv.push('--quiet')
  if (opts.bare) argv.push('--bare')
  if (opts.initialBranch !== undefined) argv.push('-b', opts.initialBranch)
  const target = optionalPositional('init', 'path', path)
  if (target !== undefined) argv.push(target)
  return { argv, absent: NONE, parse: nothing }
}

/** Options for {@link clone}. */
export interface CloneOptions {
  /**
   * `--depth=<n>` — a shallow clone with that much history. Anything but a
   * positive integer throws a `TypeError`.
   */
  depth?: number | undefined
  /**
   * `--branch <ref>` — the branch or tag to land on.
   *
   * A commit sha is NOT a `--branch` argument: git refuses one. Clone
   * without it and `checkout` the sha afterwards.
   */
  branch?: string | undefined
  /** `--bare` — a store with no working tree. */
  bare?: boolean | undefined
  /**
   * `--mirror` — a bare store that copies every ref of the source, and whose
   * `fetch` overwrites them. Implies `bare`.
   *
   * Its refspec `+refs/*:refs/*` covers every ref, tags included. So with
   * `mirror`, `noTags` has no effect, and `singleBranch` holds for the clone
   * only: a later fetch gets every ref. git refuses `mirror` with `branch`
   * (exit 128).
   */
  mirror?: boolean | undefined
  /** `--single-branch` — fetch only the branch the clone lands on. */
  singleBranch?: boolean | undefined
  /** `--no-tags` — fetch no tags, now or on a later fetch. */
  noTags?: boolean | undefined
  /** `--quiet` — suppress the progress lines. */
  quiet?: boolean | undefined
}

/**
 * `git clone [--depth=n] [--branch ref] [--bare|--mirror] <url> [dest]`.
 *
 * The one verb in this table that does not run inside a repository — it
 * makes one. A client's `cwd` is where a relative `dest` resolves, and both
 * clients bind it the same way they bind every other call.
 */
export function clone(
  url: string,
  dest?: string | undefined,
  opts: CloneOptions = {},
): GitVerb<void> {
  const argv = ['clone']
  if (opts.quiet) argv.push('--quiet')
  if (opts.bare) argv.push('--bare')
  if (opts.mirror) argv.push('--mirror')
  if (opts.singleBranch) argv.push('--single-branch')
  if (opts.noTags) argv.push('--no-tags')
  if (opts.depth !== undefined) argv.push(depthArg('clone', opts.depth))
  if (opts.branch !== undefined) argv.push('--branch', opts.branch)
  argv.push(positional('clone', 'url', url))
  const target = optionalPositional('clone', 'dest', dest)
  if (target !== undefined) argv.push(target)
  return { argv, absent: NONE, parse: nothing }
}

/**
 * A pinned `--force-with-lease`: `ref` must still be at `expect` for the push
 * to go through. `expect: null` pins "the ref does not exist", which is what a
 * create-only push wants.
 */
export interface ForceLease {
  /** Full remote ref, e.g. `refs/heads/feature`. */
  readonly ref: string
  /** The object id the remote ref is expected to hold; `null` for "absent". */
  readonly expect: string | null
}

/**
 * The `--force-with-lease=<ref>:<oid>` argument for `lease`. Pure, so display
 * text (a plan's command line) can share the exact spelling that is executed.
 *
 * An empty `ref` or `expect` is refused: the empty-oid spelling means "ref
 * must be absent", and reaching it from a missing sha by accident would turn
 * an intended pin into the wrong check. Absence is only ever `expect: null`.
 */
export function forceWithLeaseArg(lease: ForceLease): string {
  if (lease.ref === '') throw new Error('force-with-lease: ref is empty')
  if (lease.expect === '') {
    throw new Error(`force-with-lease: empty expected oid for ${lease.ref}; use null for "absent"`)
  }
  return `--force-with-lease=${lease.ref}:${lease.expect ?? ''}`
}

/**
 * Push a refspec.
 *
 * `forceWithLease` takes a {@link ForceLease} for the pinned form, or `true`
 * for the bare `--force-with-lease`. `true` is the unsafe form. It trusts
 * whatever the local remote-tracking ref says, and a background fetch can
 * bring that up to date. The lease then blocks nothing, and a concurrent push
 * is overwritten. Pin the lease whenever the expected remote sha is known.
 */
export function push(
  remote: string,
  refspec: string,
  opts: { forceWithLease?: boolean | ForceLease | undefined } = {},
): GitVerb<void> {
  const argv = ['push']
  const lease = opts.forceWithLease
  if (lease === true) argv.push('--force-with-lease')
  else if (typeof lease === 'object' && lease !== null) argv.push(forceWithLeaseArg(lease))
  else if (lease !== undefined && lease !== false) {
    throw new Error(`force-with-lease: unsupported value ${JSON.stringify(lease)}`)
  }
  argv.push(positional('push', 'remote', remote), positional('push', 'refspec', refspec))
  return { argv, absent: NONE, parse: nothing }
}

/** Options for {@link pushPorcelain}. */
export interface PushPorcelainOptions {
  /**
   * `--force-with-lease`: `true` for the bare form, a {@link ForceLease}, or
   * one lease per ref for a multi-ref push. See {@link push} for why `true` is
   * the unsafe form.
   */
  forceWithLease?: boolean | ForceLease | ForceLease[] | undefined
  /** `--atomic` — the remote updates every ref or none. */
  atomic?: boolean | undefined
}

/**
 * The status character `git push --porcelain` prints for a ref: `' '`
 * fast-forward, `'+'` forced, `'-'` deleted, `'*'` new, `'!'` rejected, `'='`
 * up to date.
 */
export type PushFlag = ' ' | '+' | '-' | '*' | '!' | '='

/**
 * Why a ref was rejected, read from git's reason text.
 *
 * - `stale`: the lease check failed before anything was sent (`stale info`,
 *   or `remote ref updated since checkout` from `--force-if-includes`).
 * - `non-fast-forward`: `non-fast-forward` or `fetch first`.
 * - `already-exists`: the ref was there and the push may not replace it: a
 *   tag (`already exists`), or a create the remote lost to another writer
 *   (`reference already exists`).
 * - `ref-conflict`: the remote cannot hold this ref beside another, such as
 *   `<ref>` beside `<ref>/child`. Nothing raced.
 * - `lock-failed`: another writer moved or deleted the ref at the remote
 *   after the lease check passed (`incorrect old value provided`, `reference
 *   does not exist`, or a `cannot lock ref` detail with `but expected` or
 *   `unable to resolve reference`).
 * - `hook-declined`: a remote hook refused the ref.
 * - `other`: anything else. `rawReason` and `detail` keep the text.
 */
export type PushRejection =
  | 'stale'
  | 'non-fast-forward'
  | 'already-exists'
  | 'ref-conflict'
  | 'lock-failed'
  | 'hook-declined'
  | 'other'

/** One ref line of `git push --porcelain`. */
export interface PushRefResult {
  /** The local side as git printed it: a ref, `HEAD`, a sha, or `''` for a delete. */
  src: string
  /** The remote ref. */
  dst: string
  flag: PushFlag
  /** The summary without the reason: `[rejected]`, `[new branch]`, `abc..def`. */
  summary: string
  /** Set only when `flag` is `'!'`. */
  rejection?: PushRejection
  /** The text in parentheses after the summary, or null when there is none. */
  rawReason: string | null
  /**
   * The remote's `cannot lock ref '<dst>': …` line for this ref, without the
   * `remote: error: ` prefix, or null when the remote printed none. git
   * prints it on stderr, apart from the ref line, and some versions not at
   * all.
   */
  detail: string | null
}

/** What {@link pushPorcelain} returns. */
export interface PushReport {
  /** One entry per ref line. A remote with several push URLs repeats its refs. */
  refs: PushRefResult[]
  /** git's stderr, for the remote's own messages, such as a hook's reason. */
  stderr: string
}

/** `<flag>\t<src>:<dst>\t<summary>[ (<reason>)]` */
const PUSH_REF_LINE = /^([ +\-*!=])\t([^\t]*)\t(.*)$/
/**
 * A remote's per-ref lock error on stderr. git pads the line with spaces to
 * clear progress output; it uses an escape code only on a terminal, which
 * captured stderr never is.
 */
const LOCK_DETAIL = /^remote: (?:error: )?(cannot lock ref '([^']+)': .*?)\s*$/gm
/** git could not create the ref's lock file: one is in the way, or the directory is read-only. Not a race. */
const LOCK_FILE = /unable to create '[^']*\.lock'/

/**
 * The rejection for a reason and its detail. Matched on text, never on the
 * local git version: a `[remote rejected]` reason is written by the remote's
 * git. The wordings, as git 2.53 and 2.54 print them and as older git did:
 *
 *   ref moved by another writer    `incorrect old value provided`;
 *                                  older `failed to update ref` + `… but expected …`
 *   ref deleted by another writer  `reference does not exist`;
 *                                  older `failed to update ref` + `unable to resolve reference`
 *   ref created by another writer  `reference already exists`;
 *                                  older `failed to update ref` + `reference already exists`
 *   `<ref>` beside `<ref>/child`   `refname conflict`;
 *                                  older `failed to update ref` + `'<ref>/child' exists; cannot create '<ref>'`
 *   a `.lock` file in the way      `reference already exists`; older `failed to update ref`
 *
 * `failed to update ref` alone is not a race: a ref clash, an unwritable refs
 * directory and a stale lock all end that way. A stale lock reads exactly
 * like a lost create on 2.53, which prints no detail; only 2.54's detail
 * (`Unable to create '….lock'`) tells them apart. A host may also put the
 * whole lock error in the reason, so the detail patterns are tried on both.
 */
function pushRejection(reason: string | null, detail: string | null): PushRejection {
  const r = (reason ?? '').toLowerCase()
  const d = (detail ?? '').toLowerCase()
  if (r === 'stale info' || r === 'remote ref updated since checkout') return 'stale'
  if (r === 'non-fast-forward' || r === 'fetch first') return 'non-fast-forward'
  if (r === 'already exists') return 'already-exists'
  if (r.includes('hook declined')) return 'hook-declined'
  if (r === 'refname conflict') return 'ref-conflict'
  if (r === 'incorrect old value provided' || r === 'reference does not exist') {
    return 'lock-failed'
  }
  const text = `${r}\n${d}`
  if (LOCK_FILE.test(text)) return 'other'
  if (/' exists; cannot create '/.test(text)) return 'ref-conflict'
  if (text.includes(' but expected ') || text.includes('unable to resolve reference')) {
    return 'lock-failed'
  }
  if (text.includes('reference already exists')) return 'already-exists'
  return 'other'
}

/** Read `git push --porcelain` output into per-ref results. */
function parsePushReport(stdout: string, stderr: string): PushReport {
  const details = new Map<string, string>()
  for (const m of stderr.matchAll(LOCK_DETAIL)) {
    if (!details.has(m[2]!)) details.set(m[2]!, m[1]!)
  }
  const refs: PushRefResult[] = []
  for (const line of stdout.split('\n')) {
    const m = PUSH_REF_LINE.exec(line.replace(/\r$/, ''))
    if (m === null) continue
    const [, flag, pair, status] = m as unknown as [string, PushFlag, string, string]
    // A ref name cannot hold `:`, so the first one splits the pair.
    const colon = pair.indexOf(':')
    const dst = pair.slice(colon + 1)
    // A summary never holds ` (`, so the first one opens the reason.
    const open = status.indexOf(' (')
    const hasReason = open >= 0 && status.endsWith(')')
    const rawReason = hasReason ? status.slice(open + 2, -1) : null
    const detail = details.get(dst) ?? null
    const ref: PushRefResult = {
      src: pair.slice(0, colon),
      dst,
      flag,
      summary: hasReason ? status.slice(0, open) : status,
      rawReason,
      detail,
    }
    if (flag === '!') ref.rejection = pushRejection(rawReason, detail)
    refs.push(ref)
  }
  return { refs, stderr }
}

/**
 * `git push --porcelain [--atomic] [--force-with-lease…] <remote> <refspec…>`,
 * read into one result per ref.
 *
 * A rejected ref is a value, not a throw. git exits 1 when any ref is
 * rejected, so exit 1 is declared absent, and the parse throws unless a ref
 * line says `!`. A local pre-push hook decline and a refspec that matches
 * nothing exit 1 with no ref lines, so they throw. So does every transport
 * failure (exit 128: an unknown remote, auth, network, TLS), as the
 * classified failure.
 *
 * Runs with `LC_ALL=C`, so the caller's locale does not change the reason
 * text. An empty refspec list throws a `TypeError`: git would push its
 * default set.
 */
export function pushPorcelain(
  remote: string,
  refspec: string | string[],
  opts: PushPorcelainOptions = {},
): GitVerb<PushReport> {
  const specs = typeof refspec === 'string' ? [refspec] : refspec
  if (specs.length === 0) throw new TypeError('typed-git: pushPorcelain: refspec list is empty')
  const argv = ['push', '--porcelain']
  if (opts.atomic) argv.push('--atomic')
  const lease = opts.forceWithLease
  if (lease === true) argv.push('--force-with-lease')
  else if (Array.isArray(lease)) argv.push(...lease.map(forceWithLeaseArg))
  else if (typeof lease === 'object' && lease !== null) argv.push(forceWithLeaseArg(lease))
  else if (lease !== undefined && lease !== false) {
    throw new Error(`force-with-lease: unsupported value ${JSON.stringify(lease)}`)
  }
  argv.push(positional('pushPorcelain', 'remote', remote))
  for (const spec of specs) argv.push(positional('pushPorcelain', 'refspec', spec))
  return {
    argv,
    env: C_LOCALE,
    absent: [1],
    parse(r, ranArgv) {
      const report = parsePushReport(r.stdout, r.stderr)
      if (r.exitCode !== 0 && !report.refs.some((ref) => ref.flag === '!')) {
        throw new CommandFailed(ranArgv, r)
      }
      return report
    },
  }
}

/** `git reset --hard <rev>`. */
export function resetHard(rev: string): GitVerb<void> {
  return {
    argv: ['reset', '--hard', positional('resetHard', 'rev', rev)],
    absent: NONE,
    parse: nothing,
  }
}

/** Options for {@link clean}. */
export interface CleanOptions {
  /** `-d` — also delete untracked directories. */
  directories?: boolean | undefined
}

/**
 * `git clean -f`: delete untracked files, and untracked directories with
 * `{directories: true}`. Ignored files are kept.
 */
export function clean(opts: CleanOptions = {}): GitVerb<void> {
  return { argv: ['clean', opts.directories ? '-fd' : '-f'], absent: NONE, parse: nothing }
}

/** Delete a local branch (`-d`, or `-D` with `{force: true}`). */
export function deleteBranch(
  name: string,
  opts: { force?: boolean | undefined } = {},
): GitVerb<void> {
  return {
    argv: ['branch', opts.force ? '-D' : '-d', positional('deleteBranch', 'name', name)],
    absent: NONE,
    parse: nothing,
  }
}

/**
 * `git update-ref -d <ref> <expected>`: delete `ref` only while it still
 * points at `expected`, so a commit pushed after the caller looked is never
 * lost. Unlike `branch -d`, git does not refuse a branch checked out in a
 * worktree; the caller must rule that out. It also leaves the branch's
 * `branch.<name>.*` config section in place.
 */
export function deleteRef(ref: string, opts: { expected: string }): GitVerb<void> {
  return {
    argv: [
      'update-ref',
      '-d',
      positional('deleteRef', 'ref', ref),
      positional('deleteRef', 'expected', opts.expected),
    ],
    absent: NONE,
    parse: nothing,
  }
}

/** `git worktree add [--detach] [-b branch] <path> [startPoint]`. */
export function worktreeAdd(
  path: string,
  opts: {
    branch?: string | undefined
    startPoint?: string | undefined
    detach?: boolean | undefined
  } = {},
): GitVerb<void> {
  const argv = ['worktree', 'add']
  if (opts.detach) argv.push('--detach')
  if (opts.branch !== undefined) argv.push('-b', opts.branch)
  argv.push(positional('worktreeAdd', 'path', path))
  const start = optionalPositional('worktreeAdd', 'startPoint', opts.startPoint)
  if (start !== undefined) argv.push(start)
  return { argv, absent: NONE, parse: nothing }
}

/** `git worktree remove [--force] <path>`. */
export function worktreeRemove(
  path: string,
  opts: { force?: boolean | undefined } = {},
): GitVerb<void> {
  const argv = ['worktree', 'remove']
  if (opts.force) argv.push('--force')
  argv.push(positional('worktreeRemove', 'path', path))
  return { argv, absent: NONE, parse: nothing }
}

/** Options for {@link worktreeMove}. */
export interface WorktreeMoveOptions {
  /** `--force` — move even when the worktree is dirty or locked. */
  force?: boolean | undefined
}

/** `git worktree move [--force] <from> <to>`. */
export function worktreeMove(
  from: string,
  to: string,
  opts: WorktreeMoveOptions = {},
): GitVerb<void> {
  const argv = ['worktree', 'move']
  if (opts.force) argv.push('--force')
  argv.push(positional('worktreeMove', 'from', from), positional('worktreeMove', 'to', to))
  return { argv, absent: NONE, parse: nothing }
}

/** `git worktree prune`. */
export function worktreePrune(): GitVerb<void> {
  return { argv: ['worktree', 'prune'], absent: NONE, parse: nothing }
}

/** `git remote add <name> <url>`. */
export function remoteAdd(name: string, url: string): GitVerb<void> {
  return {
    argv: [
      'remote',
      'add',
      positional('remoteAdd', 'name', name),
      positional('remoteAdd', 'url', url),
    ],
    absent: NONE,
    parse: nothing,
  }
}

// ── integration ─────────────────────────────────────────────────────────────
//
// `merge` and `rebase` are the verbs where a non-zero exit carries the answer:
// a conflict is the outcome a caller asked about, not a failure to report. So
// exit 1 is declared absent and the parse turns it into a `conflict` outcome.
//
// That is only safe because the parse looks past the exit code. Measured
// against git 2.50.1:
//
//   git merge, conflict                     1   (stdout carries the report)
//   git merge, unknown ref                  1   (stdout empty)
//   git merge, would overwrite local edits  2
//   git merge, merge already in progress    128
//   git merge, unrelated histories          128
//   git merge, outside a repository         128
//   git rebase, conflict                    1
//   git rebase --continue, still conflicted 1
//   git rebase, unknown ref                 128
//   git rebase/merge --abort, none running  128
//
// An unknown ref exits 1 exactly like a conflict, so the exit code alone
// cannot tell them apart. What does is that a conflict always writes its
// report to stdout and a refusal writes nothing there. That depends on where
// the output goes, not on matching git's words.
//
// `fastForward`, `alreadyUpToDate` and the conflict list do read git's text.
// That text is translatable, so `merge`, `rebase` and `rebaseContinue` run
// with `LC_ALL=C`, and a caller's locale does not change an outcome.

/** How an integration attempt ended. */
export type IntegrationOutcome<Extra> =
  | ({ status: 'clean' } & Extra)
  /**
   * Conflicted. `conflicts` is a best-effort read of git's own report. It has
   * no parseable form for rename/rename or rename/delete, so it can be empty
   * on a real conflict. Ask
   * {@link lsFilesUnmerged} or `diffNameOnly({ diffFilter: "U" })` for the
   * authoritative list.
   */
  | { status: 'conflict'; conflicts: string[] }

export type MergeOutcome = IntegrationOutcome<{
  fastForward: boolean
  alreadyUpToDate: boolean
}>

export type RebaseOutcome = IntegrationOutcome<{ alreadyUpToDate: boolean }>

/** `CONFLICT (content|add/add|…): Merge conflict in <path>` */
const CONFLICT_MERGE_IN = /^CONFLICT \([^)]*\): Merge conflict in (.+)$/
/** `CONFLICT (modify/delete): <path> deleted in <x> and modified in <y>…` */
const CONFLICT_MODIFY_DELETE = /^CONFLICT \(modify\/delete\): (.+?) deleted in .+? and modified in /

/** Paths git named in its own conflict report. Best effort — see the type. */
function conflictPaths(stdout: string): string[] {
  const seen = new Set<string>()
  for (const line of stdout.split('\n')) {
    const m = CONFLICT_MERGE_IN.exec(line) ?? CONFLICT_MODIFY_DELETE.exec(line)
    if (m?.[1] !== undefined) seen.add(m[1])
  }
  return [...seen]
}

/**
 * Read an exit-1 integration result: a conflict, or a refusal that must throw.
 *
 * Empty stdout means git declined before it started merging — an unknown ref,
 * a name it cannot resolve. That is not an answer, so it fails like any other
 * broken invocation.
 */
function conflictOrThrow(
  argv: string[],
  r: CommandResult,
): { status: 'conflict'; conflicts: string[] } {
  if (r.stdout.trim() === '') throw new CommandFailed(argv, r)
  return { status: 'conflict', conflicts: conflictPaths(r.stdout) }
}

/** Options for {@link merge}. */
export interface MergeOptions {
  /** `--no-ff` — always record a merge commit, even where a fast-forward fits. */
  noFf?: boolean | undefined
  /** `--no-commit` — merge the trees but leave the commit to the caller. */
  noCommit?: boolean | undefined
  /** `--ff-only` — refuse (exit 128) unless the merge is a fast-forward. */
  ffOnly?: boolean | undefined
  /** `-m` — the merge commit's message. */
  message?: string | undefined
}

/**
 * Merge `ref` into the current branch (`git merge --no-edit`).
 *
 * `--no-edit` is always passed: an editor prompt in a non-interactive caller
 * hangs.
 *
 * `absent: [1]` — a conflict is this verb's "asked and answered". See the
 * section note above for the measured codes and why the parse looks at
 * stdout rather than trusting the exit code alone.
 */
export function merge(ref: string, opts: MergeOptions = {}): GitVerb<MergeOutcome> {
  const argv = ['merge', '--no-edit']
  if (opts.noFf) argv.push('--no-ff')
  if (opts.noCommit) argv.push('--no-commit')
  if (opts.ffOnly) argv.push('--ff-only')
  if (opts.message !== undefined) argv.push('-m', opts.message)
  argv.push(positional('merge', 'ref', ref))
  const verb: GitVerb<MergeOutcome> = {
    argv,
    env: C_LOCALE,
    absent: [1],
    parse(r, ranArgv) {
      if (r.exitCode !== 0) return conflictOrThrow(ranArgv, r)
      return {
        status: 'clean',
        fastForward: /^Fast-forward$/m.test(r.stdout),
        alreadyUpToDate: /^Already up[- ]to[- ]date\.?$/m.test(r.stdout),
      }
    },
  }
  return verb
}

/**
 * `git merge --abort`.
 *
 * `absent: []` — exit 128 means no merge was in progress, and a caller that
 * asked to abort one has been told something it did not know.
 */
export function mergeAbort(): GitVerb<void> {
  return { argv: ['merge', '--abort'], absent: NONE, parse: nothing }
}

/** Options for {@link rebase}. */
export interface RebaseOptions {
  /** `--autostash` — shelve and restore a dirty tree around the replay. */
  autostash?: boolean | undefined
}

/**
 * Replay the current branch onto `onto` (`git rebase`).
 *
 * `absent: [1]` for the same reason as {@link merge}. An unknown ref exits
 * 128 here rather than 1, so this verb is the less ambiguous of the two —
 * the stdout check costs nothing and keeps the two parses identical.
 */
export function rebase(onto: string, opts: RebaseOptions = {}): GitVerb<RebaseOutcome> {
  const argv = ['rebase']
  if (opts.autostash) argv.push('--autostash')
  argv.push(positional('rebase', 'onto', onto))
  const verb: GitVerb<RebaseOutcome> = {
    argv,
    env: C_LOCALE,
    absent: [1],
    parse(r, ranArgv) {
      if (r.exitCode !== 0) return conflictOrThrow(ranArgv, r)
      return {
        status: 'clean',
        alreadyUpToDate: /is up to date/m.test(r.stdout),
      }
    },
  }
  return verb
}

/** `git rebase --abort`. `absent: []` — 128 means no rebase was running. */
export function rebaseAbort(): GitVerb<void> {
  return { argv: ['rebase', '--abort'], absent: NONE, parse: nothing }
}

/**
 * `git rebase --continue`, with the editor stubbed out.
 *
 * `-c core.editor=true` rather than an environment variable, so the argv alone
 * describes the whole command.
 *
 * `absent: [1]` — the replay can conflict again on the next commit, which is
 * an answer, not a failure.
 */
export function rebaseContinue(): GitVerb<RebaseOutcome> {
  const verb: GitVerb<RebaseOutcome> = {
    argv: ['-c', 'core.editor=true', 'rebase', '--continue'],
    env: C_LOCALE,
    absent: [1],
    parse(r, ranArgv) {
      if (r.exitCode !== 0) return conflictOrThrow(ranArgv, r)
      return { status: 'clean', alreadyUpToDate: false }
    },
  }
  return verb
}

/**
 * How a merge would end, computed without a working tree.
 *
 * `tree` is the merged tree git wrote to the object database — real enough to
 * hand to `commit-tree`, so a clean prediction is also the whole answer: a
 * caller that only needs the merge commit never checks anything out. On a
 * conflict the tree holds the conflict-marked blobs instead.
 */
export type MergeTreeOutcome =
  | { status: 'clean'; tree: string }
  /** Unlike {@link MergeOutcome}, `conflicts` is git's own list — see {@link mergeTree}. */
  | { status: 'conflict'; tree: string; conflicts: string[] }

/** Options for {@link mergeTree}. */
export interface MergeTreeOptions {
  /** `--merge-base=<ref>` — fix the base instead of letting git pick it. */
  mergeBase?: string | undefined
}

/**
 * `git merge-tree --write-tree`: what merging `theirs` into `ours` would do,
 * against the object database alone — no index, no checkout, no worktree.
 *
 * The cheaper counterpart of {@link merge}. Predicting every open PR's merge across a
 * 10,000-file monorepo costs seconds here; checking each one out to learn the
 * same thing costs minutes, and most of them turn out to merge cleanly.
 *
 * `-z` rather than the plain listing: otherwise git C-quotes any path that
 * needs it (`"w\303\251ird \"name\".txt"`), and a caller matching those
 * strings against real paths silently misses the files most worth attention.
 *
 * Unlike {@link merge}, the conflict list is authoritative — git names the
 * paths in a machine-readable section rather than in translatable prose — so
 * there is no need to follow up with {@link lsFilesUnmerged}.
 *
 * `absent: [1]`, with the same stdout check as the other integration verbs.
 * Measured against git 2.50.1:
 *
 *     clean                  0    `<tree>`
 *     conflict               1    `<tree>` then the conflicted paths
 *     unmergeable name       1    stdout empty
 *     unrelated histories    128
 *
 * A name git cannot merge exits 1 exactly like a conflict, so again only
 * stdout separates an answer from a refusal.
 */
export function mergeTree(
  ours: string,
  theirs: string,
  opts: MergeTreeOptions = {},
): GitVerb<MergeTreeOutcome> {
  const argv = ['merge-tree', '--write-tree', '--name-only', '-z']
  if (opts.mergeBase !== undefined) argv.push(`--merge-base=${opts.mergeBase}`)
  argv.push(positional('mergeTree', 'ours', ours), positional('mergeTree', 'theirs', theirs))
  return {
    argv,
    absent: [1],
    parse(r, ranArgv) {
      const fields = r.stdout.split('\x00')
      const tree = fields[0] ?? ''
      if (tree === '') throw new CommandFailed(ranArgv, r)
      if (r.exitCode === 0) return { status: 'clean', tree }
      // `<tree>\0<path>\0…\0\0<info records>` — the paths run to the first
      // empty field, which is what separates them from git's own commentary.
      const conflicts: string[] = []
      for (const field of fields.slice(1)) {
        if (field === '') break
        conflicts.push(field)
      }
      return { status: 'conflict', tree, conflicts }
    },
  }
}

// ── conflict inspection ─────────────────────────────────────────────────────

/** One `git ls-files -u` row — the same path appears once per present stage. */
export interface UnmergedEntry {
  mode: string
  sha: string
  /** 1 = merge base, 2 = ours, 3 = theirs. */
  stage: 1 | 2 | 3
  path: string
}

/** `<mode> <sha> <stage>\t<path>` */
const UNMERGED_ROW = /^(\d+) ([0-9a-f]+) ([123])\t(.*)$/

/**
 * `git ls-files -u`, parsed — the stage detail behind a conflict.
 *
 * Which stages are present is what distinguishes the conflict shapes: all of
 * 1/2/3 is both-modified, 1+3 is we-deleted, 1+2 is they-deleted, and 2+3
 * with no base is add/add. A resolver that treats every conflict as
 * both-modified will delete files.
 *
 * `absent: []` — a tree with nothing unmerged is exit 0 and empty stdout, so
 * `[]` means "no conflicts". Outside a repository git exits 128 and this
 * throws: a resolver that cannot read the index has not "found no conflicts".
 *
 * For the paths alone, `diffNameOnly({ diffFilter: "U" })` is cheaper.
 */
export function lsFilesUnmerged(): GitVerb<UnmergedEntry[]> {
  return {
    argv: ['ls-files', '-u', '-z'],
    absent: NONE,
    parse(r) {
      const rows: UnmergedEntry[] = []
      for (const chunk of r.stdout.split('\x00')) {
        const m = UNMERGED_ROW.exec(chunk)
        if (m === null) continue
        rows.push({
          mode: m[1]!,
          sha: m[2]!,
          stage: Number(m[3]) as 1 | 2 | 3,
          path: m[4]!,
        })
      }
      return rows
    },
  }
}

// ── checkout ────────────────────────────────────────────────────────────────

/** Which side of a conflict to take wholesale. */
export type ConflictSide = 'ours' | 'theirs'

/**
 * `git checkout --ours|--theirs -- <paths>` — resolve paths to one side.
 *
 * `absent: []` — a checkout that did not happen is not an answer. Both
 * clients return without running git when `paths` is empty.
 *
 * Note one trap in git here: on a path that is not conflicted this exits 0 and
 * does nothing. There is no error to catch, so a caller working from an old
 * conflict list silently resolves nothing. Take the path list from
 * {@link lsFilesUnmerged} just before this call, not from an earlier one.
 */
export function checkoutSide(side: ConflictSide, paths: string[]): GitVerb<void> {
  return {
    argv: ['checkout', `--${side}`, '--', ...paths],
    absent: NONE,
    parse: nothing,
  }
}

/** Options for {@link checkout}. */
export interface CheckoutOptions {
  /** Create (or with `resetBranch`, repoint) this branch at `ref`. */
  branch?: string | undefined
  /**
   * `-B` rather than `-b`: point an existing branch at `ref` instead of
   * failing because it exists. What reusing one worktree across many branches
   * needs.
   */
  resetBranch?: boolean | undefined
  /** `--force` — discard local modifications rather than refusing. */
  force?: boolean | undefined
}

/**
 * `git checkout [-f] [-b|-B <branch>] <ref>`.
 *
 * `absent: []` — an unknown ref exits 1 here, and a checkout that did not
 * happen leaves the caller on a branch it does not expect. That is a failure,
 * not an absence.
 */
export function checkout(ref: string, opts: CheckoutOptions = {}): GitVerb<void> {
  const argv = ['checkout']
  if (opts.force) argv.push('--force')
  if (opts.branch !== undefined) argv.push(opts.resetBranch ? '-B' : '-b', opts.branch)
  argv.push(positional('checkout', 'ref', ref))
  return { argv, absent: NONE, parse: nothing }
}
