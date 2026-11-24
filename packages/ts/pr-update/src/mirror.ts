/**
 * The managed clones of a standalone run (D-0005): a bare clone of a `--repo` target that has
 * no checkout on this machine, kept in the `origin/<branch>` layout the survey and `update`
 * read.
 *
 * Only `update --apply` makes one, after consent, before its survey. `survey` and a rehearsal
 * use a clone that exists. Every use takes the clone's lock, the file `<name>.git.lock` beside
 * the clone, and writes its last-used stamp, so pruning can tell a clone in use from one nobody
 * needs. Every git call in a clone runs with hooks off, as in any checkout other than the
 * project root and in every run worktree.
 *
 * Consent is any one of `--mirror-dir`, `PR_UPDATE_MIRROR_DIR` and `checkout: mirror` in the
 * machine file (`machine.ts`); the first two beat `checkout: local` for the run. With none of
 * them, `update --apply` asks once, and writes the answer to the machine file.
 */

import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
  type Stats,
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { shellJoin, stderrOrError, which, type CommandRunner } from '@osdlc/command-seam'
import { ConfigInvalidError, type MachineConfigFile } from '@osdlc/config-layers'
import { osdlcDirs } from '@osdlc/ecosystem'
import { WriteConflictError } from '@osdlc/etag-write'
import { claimLock, holderGone, processIdentity, releaseLock } from '@osdlc/file-lock'
import { expandTilde, homeDir } from '@osdlc/tiered-dirs'
import { Git } from '@osdlc/typed-git'
import { Document, isMap, parseDocument } from 'yaml'

import {
  FOLDER_MODE,
  folderProblem,
  foldersProblem,
  ownedByMe,
  type FolderCheckOptions,
  type GroupOptions,
  type OwnedCheck,
} from './folders.ts'
import type { CloneLookup, MissedCheckout } from './locate.ts'
import {
  machineFile,
  prUpdatePaths,
  type MachineConfig,
  type machineConfigSchema,
} from './machine.ts'
import type { LocateTarget } from './ports.ts'
import { NO_MAINTENANCE, maintainClone } from './clone-maintenance.ts'
import { SurveyUsageError, hostKey, type ManagedClones, type RepoTarget } from './survey.ts'
import { targetGitOptions } from './update/execute.ts'

/** The variable that names the clone directory for a run. Setting it is consent to clone. */
export const MIRROR_DIR_ENV = 'PR_UPDATE_MIRROR_DIR'

/** The file at the root of a clone directory that says pr-update made it its own. */
export const MIRROR_MARKER = '.pr-update-mirror'

/** The file inside a clone that says pr-update made it. A clone without one is never used or removed. */
export const CLONE_MARKER = 'pr-update-clone.json'

/** The file inside a clone that holds when a run last used it, as an ISO time. */
export const CLONE_STAMP = 'pr-update-last-used'

/** How long `update --apply` waits for a clone another run holds, before it skips the target as `mirror busy`. */
export const MIRROR_LOCK_WAIT_MS = 60_000

/** A clone directory that cannot be used: exit 2, naming it, with nothing written. */
export class MirrorDirError extends SurveyUsageError {
  override name = 'MirrorDirError'
}

/** A target as a clone's path names it: the host without its port, the owner and the name, lower-cased. */
export interface CloneKey {
  host: string
  owner: string
  name: string
}

/** The clone of `key` under the clone directory `root`: `<root>/<host>/<owner>/<name>.git`. */
export function clonePath(root: string, key: CloneKey): string {
  return join(root, key.host, key.owner, `${key.name}.git`)
}

/** The lock of the clone at `clone`: beside it, so it exists before the clone and outlives its removal. */
export function cloneLockPath(clone: string): string {
  return `${clone}.lock`
}

export { foldersProblem, ownedByMe, type OwnedCheck } from './folders.ts'

/** How to put right a clone folder others can write to, for the end of the message. */
function writableFix(dir: string): string {
  return (
    `run \`chmod go-w ${dir}\`, or choose a clone directory on a filesystem with Unix permissions ` +
    '(--mirror-dir, PR_UPDATE_MIRROR_DIR or `pr-update mirror enable --mirror-dir`)'
  )
}

/** The folder check of the clone directory and the folders in it (`folderProblem`), with its fix. */
export const cloneFolders: FolderCheckOptions = { fix: writableFix }

/**
 * What is at the clone path `path`, `<root>/<host>/<owner>/<name>.git` under the clone
 * directory `root`:
 * - `clone`: a clone this tool made, which the run may use. It is a real directory, not a
 *   symbolic link, holding {@link CLONE_MARKER} as a plain file, and the clone and the marker
 *   belong to the person running pr-update ({@link OwnedCheck});
 * - `missing`: nothing, so one may be made there;
 * - `{ foreign }`: anything else, with why it is not used. It is never used or replaced, so a
 *   folder someone planted there cannot be adopted.
 *
 * Either way, `root` and the folders between it and the clone (`<host>`, `<host>/<owner>`), as
 * far as they exist, must be real folders the person owns that no one else can write to
 * (`folderProblem` in `./folders.ts`); else the result is `foreign`. `root` may be a symbolic
 * link to such a folder, a folder between may not. The same rule holds for the clone itself and
 * its `config`, which must not be a symbolic link either: whoever can write that file chooses
 * what git runs there (`core.sshCommand`, a credential helper). `group` says whose private group
 * a group-writable folder may have (default this process's); a test injects another.
 */
export function checkClone(
  root: string,
  path: string,
  owned: OwnedCheck = ownedByMe,
  group: GroupOptions = {},
): 'clone' | 'missing' | { foreign: string } {
  const folders = foldersProblem(root, [dirname(dirname(path)), dirname(path)], owned, {
    ...group,
    ...cloneFolders,
  })
  if (folders !== null) {
    const fix = folders.fix === undefined ? '' : `; ${folders.fix}`
    return { foreign: `${folders.problem}, so ${path} is not used${fix}` }
  }
  const at = lstatOrNull(path)
  if (at === null) return 'missing'
  if (at.isSymbolicLink()) return { foreign: `${path} is a symbolic link, so it is not used` }
  const marker = join(path, CLONE_MARKER)
  const mark = at.isDirectory() ? lstatOrNull(marker) : null
  if (mark === null) {
    return { foreign: `${path} is in the way: pr-update did not make it, so it is not used` }
  }
  if (!mark.isFile()) return { foreign: `${marker} is not a plain file, so ${path} is not used` }
  for (const [what, st] of [
    [path, at],
    [marker, mark],
  ] as const) {
    if (!owned(st)) return { foreign: `${what} belongs to another user, so ${path} is not used` }
  }
  const config = join(path, 'config')
  const conf = lstatOrNull(config)
  if (conf?.isSymbolicLink() === true) {
    return { foreign: `${config} is a symbolic link, so ${path} is not used` }
  }
  for (const [what, st] of [
    [path, at],
    [config, conf],
  ] as const) {
    const why = st === null ? null : folderProblem(what, st, owned, { ...group, ...cloneFolders })
    if (why !== null) {
      const fix = why.fix === undefined ? '' : `; ${why.fix}`
      return { foreign: `${why.problem}, so ${path} is not used${fix}` }
    }
  }
  return 'clone'
}

/**
 * Take write for group and others off `path` and everything under it, as `chmod -R go-w` does,
 * without following a symbolic link. `gh repo clone` lays the clone down under the process's
 * umask, which may let others write to it. A file that goes while the walk runs is passed over.
 * A detached `git maintenance` the fetch started once took and dropped lock files during the walk;
 * `NO_MAINTENANCE` now keeps one from starting, and this stays as a backstop.
 */
function dropOthersWrite(path: string): void {
  const gone = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === 'ENOENT'
  try {
    const st = lstatSync(path)
    if (st.isSymbolicLink()) return
    if ((st.mode & 0o022) !== 0) chmodSync(path, st.mode & 0o7755)
    if (st.isDirectory()) for (const name of readdirSync(path)) dropOthersWrite(join(path, name))
  } catch (e) {
    if (!gone(e)) throw e
  }
}

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

/**
 * Make the `<host>` and `<owner>` folders above `clone`, `<root>/<host>/<owner>/<name>.git`, as
 * far as they are missing, one level at a time. Before each is made, the folders above it are
 * checked as {@link checkClone} checks them, so nothing is made under a symbolic link or a folder
 * someone else can write to, and one another run made in between is checked too. Each is made
 * with {@link FOLDER_MODE}.
 *
 * @returns why the clone may not be used, or why a folder could not be made; null when the
 *   folders are in place.
 */
function makeCloneFolders(clone: string, owned: OwnedCheck): string | null {
  const owner = dirname(clone)
  const host = dirname(owner)
  const between = [host, owner]
  for (let i = 0; i <= between.length; i++) {
    let folders: ReturnType<typeof foldersProblem>
    try {
      folders = foldersProblem(dirname(host), between.slice(0, i), owned, cloneFolders)
    } catch (e) {
      return `cannot read the folders above ${clone}: ${(e as Error).message}`
    }
    if (folders !== null) {
      const fix = folders.fix === undefined ? '' : `; ${folders.fix}`
      return `${folders.problem}, so ${clone} is not used${fix}`
    }
    const next = between[i]
    if (next === undefined) break
    try {
      mkdirSync(next, { mode: FOLDER_MODE })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
        return `cannot make ${next}: ${(e as Error).message}`
      }
    }
  }
  return null
}

/** Write the last-used stamp of the clone at `clone`. */
export function writeStamp(clone: string): void {
  writeFileSync(join(clone, CLONE_STAMP), `${new Date().toISOString()}\n`)
}

/**
 * A clone directory as given (`--mirror-dir`, `PR_UPDATE_MIRROR_DIR`, `mirror_dir`, a typed
 * answer): `~` expanded against `home`, then required to be absolute.
 *
 * @throws MirrorDirError for a relative path. `what` names where it came from.
 */
export function mirrorDirFrom(raw: string, home: string, what: string): string {
  const expanded = expandTilde(raw.trim(), home)
  if (!isAbsolute(expanded)) {
    throw new MirrorDirError(`${what} must be an absolute path or start with ~/; it is '${raw}'`)
  }
  return resolve(expanded)
}

/** The run's answer on cloning, and where clones go. */
export interface MirrorSetting {
  /** `mirror`: clone a target with no checkout. `local`: never. null: nobody has said. */
  consent: 'mirror' | 'local' | null
  /** The clone directory. */
  dir: string
  /** Where {@link dir} came from, in D-0005's order. */
  from: 'flag' | 'env' | 'machine' | 'default'
}

/**
 * Consent and the clone directory, first match winning: `--mirror-dir` (`flag`, already
 * absolute), {@link MIRROR_DIR_ENV} in `env`, the machine file's `checkout` and `mirror_dir`,
 * then `repos/` in pr-update's cache directory. The flag and the variable are consent, whatever
 * `checkout` says. `OSDLC_ROOT` and the home variables are not.
 */
export function mirrorSetting(opts: {
  flag?: string | undefined
  env: Record<string, string | undefined>
  machine: MachineConfig
  home: string
}): MirrorSetting {
  if (opts.flag !== undefined) return { consent: 'mirror', dir: opts.flag, from: 'flag' }
  const fromEnv = opts.env[MIRROR_DIR_ENV]
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return {
      consent: 'mirror',
      dir: mirrorDirFrom(fromEnv, opts.home, MIRROR_DIR_ENV),
      from: 'env',
    }
  }
  const consent = opts.machine.checkout ?? null
  if (opts.machine.mirror_dir !== undefined) {
    return {
      consent,
      dir: mirrorDirFrom(opts.machine.mirror_dir, opts.home, 'mirror_dir'),
      from: 'machine',
    }
  }
  const dir = prUpdatePaths(osdlcDirs({ env: opts.env, home: opts.home })).repos
  return { consent, dir, from: 'default' }
}

/**
 * The machine file read once, with a note for each issue in it (naming the file; the bad value is
 * ignored), and the {@link mirrorSetting} it gives with `flag` and `env`.
 */
export function loadMirrorSetting(
  file: MachineConfigFile<typeof machineConfigSchema>,
  opts: {
    flag?: string | undefined
    env: Record<string, string | undefined>
    home: string
    notice?: ((line: string) => void) | undefined
  },
): { setting: MirrorSetting; machine: MachineConfig } {
  const { value, issues } = file.loadWithIssues()
  for (const issue of issues) {
    const key = issue.path.length === 0 ? '' : `${issue.path.join('.')}: `
    // A YAML error's message goes on to quote the file: its first line says enough.
    const message = (issue.message.split('\n')[0] ?? '').replace(/:\s*$/, '')
    opts.notice?.(`${file.path()}: ${key}${message}; it is ignored`)
  }
  const setting = mirrorSetting({ flag: opts.flag, env: opts.env, machine: value, home: opts.home })
  return { setting, machine: value }
}

/**
 * Clone step 1: `dir` must not be inside a git working tree or git directory, and must be
 * missing, empty or already marked by this tool. When it exists it must belong to the person
 * running pr-update and pass the folder check (`folderProblem`: no one else may write to it); its
 * marker must be a plain file the person owns. Nothing is written.
 *
 * @throws MirrorDirError naming the directory.
 */
export function checkMirrorDir(
  dir: string,
  git?: CommandRunner | undefined,
  owned: OwnedCheck = ownedByMe,
): void {
  let at = dir
  while (!existsSync(at)) {
    const up = dirname(at)
    if (up === at) break
    at = up
  }
  const answer = new Git(at, targetGitOptions(git)).raw([
    'rev-parse',
    '--is-inside-work-tree',
    '--is-inside-git-dir',
  ])
  if (answer.exitCode === 0 && /\btrue\b/.test(answer.stdout)) {
    throw new MirrorDirError(
      `the clone directory ${dir} is inside a git repository; choose one outside every checkout`,
    )
  }
  if (!existsSync(dir)) return
  if (!statSync(dir).isDirectory()) {
    throw new MirrorDirError(`the clone directory ${dir} is not a directory`)
  }
  const why = folderProblem(dir, statSync(dir), owned, cloneFolders)
  if (why !== null) {
    const fix = why.fix === undefined ? '' : `; ${why.fix}`
    throw new MirrorDirError(`the clone directory ${why.problem}${fix}`)
  }
  const entries = readdirSync(dir)
  if (entries.length > 0 && !entries.includes(MIRROR_MARKER)) {
    throw new MirrorDirError(
      `the clone directory ${dir} holds files pr-update did not put there; choose an empty or new directory`,
    )
  }
  if (!entries.includes(MIRROR_MARKER)) return
  const marker = join(dir, MIRROR_MARKER)
  const mark = lstatSync(marker)
  if (!mark.isFile()) {
    throw new MirrorDirError(`${marker} is not a plain file, so ${dir} is not used`)
  }
  if (!owned(mark)) {
    throw new MirrorDirError(`${marker} belongs to another user, so ${dir} is not used`)
  }
}

/** Write {@link MIRROR_MARKER} at the root of `dir`, creating it if absent, so two runs marking it at once both pass. */
export function markMirrorDir(dir: string): void {
  // 0o755 at most (less under a stricter umask), so the checks never refuse a folder pr-update made.
  mkdirSync(dir, { recursive: true, mode: FOLDER_MODE })
  let fd: number
  try {
    fd = openSync(join(dir, MIRROR_MARKER), 'wx')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return
    throw e
  }
  try {
    writeSync(fd, "pr-update's managed clones. `pr-update mirror prune` removes old ones.\n")
  } finally {
    closeSync(fd)
  }
}

/** What a clone's lock records: the holding process, by pid and start, so a reused pid is not taken for it. */
interface CloneLockContent {
  tool: string
  holder: { pid: number; startedAt?: string }
}

let identity: string | null | undefined

function lockHolder(): CloneLockContent['holder'] {
  identity ??= processIdentity(process.pid)
  return { pid: process.pid, ...(identity === null ? {} : { startedAt: identity }) }
}

const holderIsGone = holderGone<CloneLockContent>((c) => [c.holder])

/** Nothing ever notifies it, so `Atomics.wait` on it just sleeps. */
const SLEEPER = new Int32Array(new SharedArrayBuffer(4))

/**
 * Take the lock at `path`, waiting up to `waitMs` for another run to let go. A lock whose holder
 * process is gone is taken over. Returns the token that releases it, or null when it stayed held.
 */
export function claimCloneLock(path: string, waitMs: number): string | null {
  const deadline = Date.now() + waitMs
  for (;;) {
    const claim = claimLock<CloneLockContent>(
      path,
      { tool: 'pr-update', holder: lockHolder() },
      { isStale: holderIsGone },
    )
    if (claim.ok) return claim.token
    const left = deadline - Date.now()
    if (left <= 0) return null
    Atomics.wait(SLEEPER, 0, 0, Math.min(250, left))
  }
}

/** The target a clone is asked for, with the host `gh` is pointed at. */
export interface CloneRequest extends CloneKey {
  /** The host as `--repo` named it, port included: `GH_HOST` and the credential URL take it. */
  ghHost: string
}

/** A clone step that failed, named. */
export class CloneError extends Error {
  override name = 'CloneError'
}

/**
 * Clone steps 3 to 7 into `final`, a path under a checked and marked clone directory, with the
 * clone's lock held by the caller:
 *
 * 3. `gh repo clone <owner>/<name> <tmp> --no-upstream -- --bare`, with `GH_HOST` set, where
 *    `<tmp>` is `<name>.git` in a staging folder beside `final`, `.tmp-<name>.git-<pid>-<random>`,
 *    which `mkdtemp` makes `0700`: no one else can reach the clone before step 7;
 * 4. in the clone's own config, `credential.https://<host>.helper` set to an empty value and then
 *    to `!<gh> auth git-credential`, as `gh auth setup-git` writes them, so later fetches and
 *    pushes authenticate whatever the global git config holds. `<gh>` is the absolute path
 *    {@link credentialHelper} finds, never a name the shell looks up on `PATH`: a push runs the
 *    helper in the run worktree, which holds the PR's files, so a relative `PATH` entry such as
 *    `.` would run a `gh` the PR commits. When it finds none, no helper is set, with a note;
 * 5. `core.longpaths=true`, and `maintenance.auto=false` and `gc.auto=0`, so no git starts a
 *    background maintenance that writes in the clone while it is hardened, moved or read;
 * 6. every `refs/heads/*` deleted, the fetch refspec set to the remote-tracking layout, and
 *    `fetch --prune`, given the same two settings with `-c`, then `git maintenance run --auto` in
 *    the foreground (`maintainClone`), as after every fetch of a clone;
 * 7. the stamp and the marker written, write for group and others taken off everything in
 *    `<tmp>` (`chmod -R go-w`), then `<tmp>` renamed to `final` and the staging folder removed.
 *
 * A step that fails removes the staging folder. One a killed run leaves is a `.tmp-*` leftover,
 * which pruning removes once it is an hour old.
 *
 * @throws CloneError naming the step.
 */
export function makeClone(
  final: string,
  req: CloneRequest,
  deps: {
    gh: CommandRunner
    git?: CommandRunner | undefined
    notice?: ((line: string) => void) | undefined
  },
): void {
  const parent = dirname(final)
  const staging = mkdtempSync(join(parent, `.tmp-${req.name}.git-${process.pid}-`))
  const tmp = join(staging, `${req.name}.git`)
  const step = (what: string, fn: () => void): void => {
    try {
      fn()
    } catch (e) {
      throw new CloneError(`${what}: ${(e as Error).message.split('\n')[0]}`)
    }
  }
  try {
    step('gh repo clone', () => {
      // The git gh runs gets what every git call in a target other than the root gets: hooks
      // off, and no inherited `GIT_DIR`, which would make `git clone` write into that repository.
      const gh = targetGitOptions(deps.gh)
      const res = gh.runner.run(
        ['repo', 'clone', `${req.owner}/${req.name}`, tmp, '--no-upstream', '--', '--bare'],
        { cwd: staging, env: { ...gh.env, GH_HOST: req.ghHost } },
      )
      if (res.exitCode !== 0) throw new Error(stderrOrError(res) || `exit ${res.exitCode}`)
    })
    const git = new Git(tmp, targetGitOptions(deps.git))
    const helper = `credential.https://${req.ghHost}.helper`
    const command = credentialHelper(deps.gh)
    if (command === null) {
      deps.notice?.(
        `${final}: no credential helper set, since \`${deps.gh.binary ?? 'gh'}\` is not on an absolute PATH entry; fetches and pushes there use your git config's helper`,
      )
    } else {
      step('set the credential helper', () => {
        git.rawChecked(['config', '--local', helper, ''])
        git.rawChecked(['config', '--local', '--add', helper, command])
      })
    }
    step('set core.longpaths', () => git.configSet('core.longpaths', 'true', { scope: 'local' }))
    step('turn off background maintenance', () => {
      for (const [key, value] of NO_MAINTENANCE) git.configSet(key, value, { scope: 'local' })
    })
    step('fetch into origin/*', () => {
      for (const { ref, sha } of git.refs('refs/heads/')) git.deleteRef(ref, { expected: sha })
      git.configSet('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*', {
        scope: 'local',
      })
      git.rawChecked([
        ...NO_MAINTENANCE.flatMap(([key, value]) => ['-c', `${key}=${value}`]),
        'fetch',
        '--prune',
        '--quiet',
        'origin',
      ])
      maintainClone(git)
    })
    step('put the clone in place', () => {
      writeStamp(tmp)
      writeFileSync(
        join(tmp, CLONE_MARKER),
        `${JSON.stringify({ tool: 'pr-update', repo: `${req.host}/${req.owner}/${req.name}` })}\n`,
      )
      // Before the rename, so the clone is never at its path while others can write to it.
      dropOthersWrite(tmp)
      renameSync(tmp, final)
    })
  } catch (e) {
    rmSync(staging, { recursive: true, force: true })
    throw e
  }
  rmSync(staging, { recursive: true, force: true })
}

/**
 * The credential helper a clone's config gets: `!<path> auth git-credential`, where `<path>` is
 * the absolute path of `gh`'s binary (its `binary`, default `gh`), found on the absolute `PATH`
 * entries only, as command-seam's `absolutePathOnly` finds it, and shell-quoted. git runs the
 * helper through the shell in the directory of the git that needs it, a run worktree holding the
 * PR's files, so a name looked up on `PATH` there could run a `gh` the PR commits. On Windows the
 * path is written with `/`, which Git for Windows' shell reads. Null when there is no such `gh`.
 */
export function credentialHelper(
  gh: Pick<CommandRunner, 'binary'>,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const name = gh.binary ?? 'gh'
  const found = isAbsolute(name) ? name : which(name, { absolutePathOnly: true, env })
  if (found === undefined) return null
  const path = process.platform === 'win32' ? found.replaceAll('\\', '/') : found
  return `!${shellJoin([path, 'auth', 'git-credential'])}`
}

/** How the first-run question is asked. The CLI passes cli-tool's prompts. */
export interface MirrorAsker {
  /** Whether a person can answer. */
  canPrompt(): boolean
  /** Ask `question` with `choices`, the first the default; the index chosen. */
  choose(question: string, choices: readonly string[]): number
  /** Ask for one line of text. */
  text(question: string): string
}

/** The keys a `mirror` answer writes to the machine file. */
export interface MirrorAnswer {
  checkout: 'mirror' | 'local'
  mirror_dir?: string | undefined
}

/**
 * The machine file as `read` holds it (null: no file), as a YAML document this tool can edit.
 *
 * @throws ConfigInvalidError naming the file, when it is not valid YAML or its root is not a
 *   map: an answer could not be saved into it, so nothing should be asked or written.
 */
export function editableMachineFile(path: string, read: { text: string } | null): Document {
  if (read === null) return new Document({})
  const doc: Document = parseDocument(read.text)
  const [error] = doc.errors
  const why =
    error !== undefined
      ? `not valid YAML: ${error.message.split('\n')[0]}`
      : doc.contents === null || isMap(doc.contents)
        ? null
        : 'its top level is not a map of keys'
  if (why !== null) {
    throw new ConfigInvalidError(
      [path],
      [{ path: '(root)', message: `${why}; fix or remove it, then run again` }],
      'pr-update machine config',
    )
  }
  if (doc.contents === null) doc.contents = doc.createNode({})
  return doc
}

/**
 * Write `answer` into the machine file as a compare-and-swap against `before` (the file as read
 * before asking, or null for none; default: read now), keeping the file's other keys and
 * comments. When the swap loses to another run's write: with `yield`, a file that now holds a
 * `checkout` is what won, and is returned unwritten; otherwise, or when it holds none, the write
 * is tried again on the new file.
 *
 * @returns the machine file as it stands, and whether this write is what it holds.
 * @throws ConfigInvalidError from {@link editableMachineFile}, before anything is written.
 */
export function writeMirrorAnswer(
  file: MachineConfigFile<typeof machineConfigSchema>,
  answer: MirrorAnswer,
  opts: { before?: { text: string; etag: string } | null; yield?: boolean } = {},
): { config: MachineConfig; wrote: boolean } {
  let before = opts.before === undefined ? file.read() : opts.before
  for (let tries = 0; tries < 5; tries++) {
    const doc = editableMachineFile(file.path(), before)
    doc.set('checkout', answer.checkout)
    if (answer.mirror_dir !== undefined) doc.set('mirror_dir', answer.mirror_dir)
    mkdirSync(dirname(file.path()), { recursive: true, mode: FOLDER_MODE })
    try {
      file.write(String(doc), { etag: before?.etag ?? null })
      file.clearCache()
      return { config: file.load(), wrote: true }
    } catch (e) {
      if (!(e instanceof WriteConflictError)) throw e
    }
    file.clearCache()
    const now = file.load()
    if (opts.yield === true && now.checkout !== undefined) return { config: now, wrote: false }
    before = file.read()
  }
  throw new Error(`${file.path()} kept changing while pr-update wrote to it; run again`)
}

/** Options for {@link managedClones}. */
export interface ManagedClonesOptions {
  /** The run's environment: {@link MIRROR_DIR_ENV}, the home directory and the osdlc directories. */
  env: Record<string, string | undefined>
  /** `--mirror-dir`, already absolute. */
  flag?: string | undefined
  /** The directory a typed relative answer is resolved against. */
  cwd: string
  /**
   * True for `update --apply`: locate leaves the note for a target with no checkout to
   * {@link ManagedClones.provide}, which may clone it.
   */
  apply: boolean
  /** Runs `gh`, for the clone and the size in the question. */
  gh: CommandRunner
  /** Runs git. Defaults to typed-git's. */
  git?: CommandRunner | undefined
  notice: (line: string) => void
  /** Asks the first-run question. */
  ask: MirrorAsker
  /** How long `update --apply` waits for a clone another run holds. Default {@link MIRROR_LOCK_WAIT_MS}. */
  waitMs?: number | undefined
  /** The machine file. Default {@link machineFile} over `env`. */
  machine?: MachineConfigFile<typeof machineConfigSchema> | undefined
  /** Whether a file is the person's own. Default {@link ownedByMe}. */
  owned?: OwnedCheck | undefined
  /** Takes a clone's lock. Default {@link claimCloneLock}; a test records the order. */
  claim?: ((path: string, waitMs: number) => string | null) | undefined
}

/** A standalone run's managed clones: what `locate` and the survey ask, and what `update` holds. */
export type StandaloneClones = ManagedClones & CloneLookup

/** `host/owner/name` of a resolved target, the host without its port. */
function keyOf(t: { host: string | null; repo: string }): string {
  return `${hostKey(t.host ?? 'github.com')}/${t.repo}`
}

/**
 * The managed clones of one run. Make one per run: it reads the machine file once, asks at most
 * once, and holds the locks it took until they are released or `close` is called.
 *
 * The lock of a clone is held, in an `update` run:
 * - from {@link ManagedClones.provide}, before the survey's fetch, for every clone the run will
 *   use. They are taken in sorted path order, so two runs given the same targets in any order
 *   never wait on each other in a cycle. `update --apply` waits up to `waitMs` for each; a
 *   rehearsal does not wait;
 * - until {@link ManagedClones.release}: `update` releases a clone with no PR to update as soon
 *   as it knows, and the others once their run worktree is added;
 * - and again while the run worktree, or a kept worktree it discards, is removed
 *   ({@link ManagedClones.removing}). That wait happens only when the run holds no other
 *   clone's lock, so every run that waits holds nothing another run waits for, and no two runs
 *   wait on each other. A clone whose lock cannot be taken back is not changed: a run
 *   worktree is left for the next run in the clone or `pr-update mirror prune`, a kept one for
 *   the next `--discard-kept`.
 *
 * `survey` holds a clone's lock while it fetches and reads that clone ({@link ManagedClones.use}),
 * and never waits for it.
 */
export function managedClones(opts: ManagedClonesOptions): StandaloneClones {
  const waitMs = opts.waitMs ?? MIRROR_LOCK_WAIT_MS
  const claim = opts.claim ?? claimCloneLock
  const owned = opts.owned ?? ownedByMe
  const file = opts.machine ?? machineFile({ env: opts.env })
  const home = (): string => homeDir({ env: opts.env })
  let setting: MirrorSetting | undefined
  const current = (): MirrorSetting => {
    setting ??= loadMirrorSetting(file, { ...opts, home: home() }).setting
    return setting
  }
  const misses = new Map<string, MissedCheckout>()
  /** The locks this run holds, by clone path. */
  const held = new Map<string, string>()
  /** Whether {@link ManagedClones.provide} ran for `update --apply`: a lock taken again waits. */
  let applying = false

  const release = (clone: string): void => {
    const token = held.get(clone)
    if (token === undefined) return
    held.delete(clone)
    releaseLock(cloneLockPath(clone), token)
  }

  /** Why a clone {@link hold} did not take was refused, when not because it was busy. */
  const unheld = new Map<string, string>()

  /**
   * Hold `clone`'s lock for the run, waiting up to `wait`. False when another run kept it, or
   * when a folder above it may not be used or made (`makeCloneFolders`), with why in `unheld`.
   */
  const hold = (clone: string, wait: number): boolean => {
    if (held.has(clone)) return true
    const why = makeCloneFolders(clone, owned)
    if (why !== null) {
      unheld.set(clone, why)
      return false
    }
    let token: string | null
    try {
      token = claim(cloneLockPath(clone), wait)
    } catch (e) {
      // The owner folder cannot be written to, say.
      unheld.set(clone, `cannot take ${cloneLockPath(clone)}: ${(e as Error).message}`)
      return false
    }
    if (token === null) return false
    unheld.delete(clone)
    held.set(clone, token)
    return true
  }

  /** Why `clone` is not held: a folder above it, or another run's lock. */
  const busy = (clone: string): string =>
    unheld.get(clone) ?? `mirror busy: another pr-update run holds ${cloneLockPath(clone)}`

  /** The clone path of `t` under `dir`. */
  const finalOf = (t: RepoTarget, dir: string): string => {
    const [owner = '', name = ''] = t.repo.split('/')
    return clonePath(dir, { host: hostKey(t.host ?? 'github.com'), owner, name })
  }

  /** The size `gh` reports, for the question. */
  const sizeOf = (t: RepoTarget): string => {
    const res = opts.gh.run(['repo', 'view', t.repo, '--json', 'diskUsage'], {
      cwd: opts.cwd,
      env: { GH_HOST: t.host ?? 'github.com' },
    })
    try {
      const kb = (JSON.parse(res.stdout) as { diskUsage?: unknown }).diskUsage
      if (res.exitCode === 0 && typeof kb === 'number') {
        return `about ${Math.max(1, Math.round(kb / 1024))} MB`
      }
    } catch {
      // Unknown size: the question still goes out.
    }
    return 'size unknown'
  }

  /** Ask whether to clone `want`, write the answer, and return the setting that holds now. */
  const ask = (want: readonly RepoTarget[]): MirrorSetting => {
    const before = file.read()
    // Never ask a question whose answer cannot be saved.
    editableMachineFile(file.path(), before)
    const dir = current().dir
    const lines: string[] = []
    lines.push(
      want.length === 1
        ? 'This repository has no checkout on this machine:'
        : 'These repositories have no checkout on this machine:',
    )
    for (const t of want) lines.push(`  ${keyOf(t)}  (${sizeOf(t)})`)
    const misses_ = want.flatMap((t) => {
      const m = misses.get(keyOf(t))
      return m === undefined ? [] : [m]
    })
    const where = misses_[0]?.where
    if (where !== undefined) lines.push(`Looked for checkouts: ${where}.`)
    for (const m of misses_) {
      for (const path of m.shallow) lines.push(`  ${path} is shallow, so it is not used.`)
    }
    lines.push(
      `pr-update can keep a bare clone of ${want.length === 1 ? 'it' : 'each'} in ${dir} and update from that.`,
      'Your working trees are never touched. The answer is saved, so this is asked once.',
    )
    const choice = opts.ask.choose(lines.join('\n'), [
      `Clone into ${dir}`,
      'Clone into another directory',
      'Do not clone: skip a repository with no checkout',
    ])
    let answer: MirrorAnswer
    if (choice === 2) answer = { checkout: 'local' }
    else if (choice === 1) {
      const typed = opts.ask.text('Directory for the clones:').trim()
      if (typed === '') throw new MirrorDirError('no directory was given for the clones')
      const chosen = resolve(opts.cwd, expandTilde(typed, home()))
      checkMirrorDir(chosen, opts.git, owned)
      answer = { checkout: 'mirror', mirror_dir: chosen }
    } else answer = { checkout: 'mirror' }
    const { config, wrote } = writeMirrorAnswer(file, answer, { before, yield: true })
    opts.notice(
      wrote
        ? `wrote checkout: ${answer.checkout}${answer.mirror_dir === undefined ? '' : ` and mirror_dir: ${answer.mirror_dir}`} to ${file.path()}`
        : `another run answered first; ${file.path()} says checkout: ${config.checkout}, which this run follows`,
    )
    setting = mirrorSetting({ flag: opts.flag, env: opts.env, machine: config, home: home() })
    return setting
  }

  /**
   * Serve `t`, which has no checkout, from its clone in `dir`, making it when there is none.
   * `provide` has taken the clone's lock, or found it busy.
   */
  const serve = (t: RepoTarget, dir: string): RepoTarget => {
    const [owner = '', name = ''] = t.repo.split('/')
    const host = hostKey(t.host ?? 'github.com')
    const final = finalOf(t, dir)
    const miss = misses.get(keyOf(t))
    const label = miss?.label ?? keyOf(t)
    const where = miss?.where ?? 'no checkout found'
    const unserved = (why: string): RepoTarget => {
      opts.notice(`${label}: ${where}; ${why}`)
      return { ...t, unserved: why }
    }
    if (!held.has(final)) return unserved(busy(final))
    const state = checkClone(dir, final, owned)
    if (state === 'clone') writeStamp(final)
    else if (state !== 'missing') {
      release(final)
      return unserved(state.foreign)
    } else {
      opts.notice(`${label}: cloning into ${final}`)
      try {
        makeClone(final, { host, owner, name, ghHost: t.host ?? 'github.com' }, opts)
      } catch (e) {
        release(final)
        return unserved(`the clone failed at ${(e as Error).message}`)
      }
    }
    opts.notice(`${label}: ${where}; using the clone ${final}`)
    const shallow = miss?.shallow ?? []
    const found = {
      path: final,
      source: 'clone' as const,
      remote: 'origin',
      ...(shallow.length > 0 ? { others: shallow } : {}),
    }
    return { ...t, path: final, source: 'clone', remote: 'origin', found }
  }

  return {
    deferMissing: opts.apply,

    existing(target: LocateTarget): string | null {
      if (target.github !== true) return null
      const s = current()
      if (s.consent === 'local') return null
      const path = clonePath(s.dir, target)
      const state = checkClone(s.dir, path, owned)
      if (state === 'clone') return path
      if (state !== 'missing') {
        opts.notice(`${target.host}/${target.owner}/${target.name}: ${state.foreign}`)
      }
      return null
    },

    missed(target, miss) {
      misses.set(`${target.host}/${target.owner}/${target.name}`, miss)
    },

    provide(targets, { apply }) {
      applying = apply
      const wait = apply ? waitMs : 0
      // Only `update --apply` clones, so only it needs consent.
      const want = apply ? targets.filter((t) => t.source === null && t.github === true) : []
      let s: MirrorSetting | null = null
      if (want.length > 0) {
        s = current()
        if (s.consent === null) {
          if (!opts.ask.canPrompt()) {
            const names = want.map(keyOf).join(', ')
            throw new SurveyUsageError(
              `${names} ${want.length === 1 ? 'has' : 'have'} no checkout on this machine, and nothing says whether pr-update may clone ${want.length === 1 ? 'it' : 'them'}: ` +
                `pass --mirror-dir <dir>, set ${MIRROR_DIR_ENV}, or run \`pr-update mirror enable\` (\`pr-update mirror disable\` skips such repositories)`,
            )
          }
          s = ask(want)
        }
        if (s.consent === 'mirror') {
          checkMirrorDir(s.dir, opts.git, owned)
          markMirrorDir(s.dir)
        }
      }
      // Every clone the run will use, locked in sorted path order: two runs given the same
      // targets in different orders then never hold one each while waiting for the other.
      const paths = new Set<string>()
      for (const t of targets) if (t.source === 'clone' && t.path !== null) paths.add(t.path)
      const dir = s?.consent === 'mirror' ? s.dir : null
      if (dir !== null) for (const t of want) paths.add(finalOf(t, dir))
      for (const path of [...paths].sort()) hold(path, wait)

      return targets.map((t) => {
        if (t.source === 'clone' && t.path !== null) {
          const gone = (why: string): RepoTarget => {
            opts.notice(`${keyOf(t)}: ${why}`)
            return { ...t, path: null, source: null, found: null, unserved: why }
          }
          if (!held.has(t.path)) return gone(busy(t.path))
          // Looked at again under the lock: a prune may have removed it while this run waited.
          const root = dirname(dirname(dirname(t.path)))
          const state = checkClone(root, t.path, owned)
          if (state === 'clone') {
            writeStamp(t.path)
            return t
          }
          if (state !== 'missing') {
            release(t.path)
            return gone(state.foreign)
          }
          // Made again, under the lock this run holds, where `update --apply` has consent.
          if (apply && current().consent === 'mirror' && finalOf(t, current().dir) === t.path) {
            opts.notice(
              `${keyOf(t)}: ${t.path} was removed (by a prune) before this run took its lock`,
            )
            return serve({ ...t, path: null, source: null, found: null }, root)
          }
          release(t.path)
          return gone(
            `${t.path} was removed (by \`pr-update mirror prune\`, say) before this run could use it`,
          )
        }
        if (!want.includes(t) || s === null) return t
        if (dir === null) {
          const why = `no checkout on this machine, and checkout: local in ${file.path()} makes no clone`
          const miss = misses.get(keyOf(t))
          opts.notice(`${miss?.label ?? keyOf(t)}: ${miss?.where ?? 'no checkout found'}; ${why}`)
          return { ...t, unserved: why }
        }
        return serve(t, dir)
      })
    },

    use(clone, read, gone) {
      if (held.has(clone)) return read(true)
      const lock = cloneLockPath(clone)
      const token = claim(lock, 0)
      if (token === null) {
        opts.notice(
          `${clone}: another pr-update run holds ${lock}, so the clone is read as it is, without a fetch`,
        )
        // Without the lock, a prune may remove the clone during the read: what was read from a
        // clone that is gone afterwards is not used, and neither is an error it caused.
        const root = dirname(dirname(dirname(clone)))
        const removed = (): string | null => {
          if (checkClone(root, clone, owned) === 'clone') return null
          const why = `${clone} was removed (by a prune) while this run read it without its lock`
          opts.notice(why)
          return why
        }
        let result: ReturnType<typeof read>
        try {
          result = read(false)
        } catch (e) {
          const why = removed()
          if (why === null) throw e
          return gone(why)
        }
        const why = removed()
        return why === null ? result : gone(why)
      }
      try {
        // Looked at again under the lock: a prune may have removed it just before this run took it.
        const state = checkClone(dirname(dirname(dirname(clone))), clone, owned)
        if (state !== 'clone') {
          const why =
            state === 'missing'
              ? `${clone} was removed (by a prune) before this run took its lock`
              : state.foreign
          opts.notice(why)
          return gone(why)
        }
        writeStamp(clone)
        return read(true)
      } finally {
        releaseLock(lock, token)
      }
    },

    release,

    removing(clone, tree, remove) {
      if (held.has(clone)) {
        remove()
        return true
      }
      const lock = cloneLockPath(clone)
      // Waiting while holding another clone's lock could close a cycle with a run that holds
      // this one and waits for that one.
      const token = claim(lock, applying && held.size === 0 ? waitMs : 0)
      if (token === null) {
        opts.notice(
          tree.kind === 'kept'
            ? `the kept worktree ${tree.path} is left in place, because another run holds its clone (${lock}); run with --discard-kept again to remove it`
            : `${tree.path} is left, because another run holds its clone (${lock}); the next run in this clone, or \`pr-update mirror prune\`, removes it`,
        )
        return false
      }
      try {
        remove()
        return true
      } finally {
        releaseLock(lock, token)
      }
    },

    close() {
      for (const clone of held.keys()) release(clone)
    },
  }
}
