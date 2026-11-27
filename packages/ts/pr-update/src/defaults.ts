/**
 * The `Ports` a standalone `pr-update` run supplies for itself, with no host
 * (a repository registry, a trust store, an agent runner) in front of it.
 *
 * A library consumer builds its own `Ports` instead. It binds `locate` to its
 * registry, `runVerb` to its own shell runner, `resolveVerifyVerbs` to its own
 * command lists and trust check, and `repair` to its own agent runner. This
 * package depends on none of them.
 */

import {
  shellRunner,
  shellRunnerAsync,
  spawnRunner,
  spawnRunnerAsync,
  stderrOrError,
  type CommandRunner,
} from '@osdlc/command-seam'

import { join } from 'node:path'

import { osdlcDirs } from '@osdlc/ecosystem'
import { Git } from '@osdlc/typed-git'

import { DETECT_LOOKED_FOR, NothingDetectedError, detectVerifyCommand } from './detect.ts'
import type { PrUpdateConfig, PrUpdateStandaloneConfig } from './config.ts'
import { standaloneLocate, type CloneLookup, type StandaloneLocateOptions } from './locate.ts'
import { prUpdatePaths } from './machine.ts'
import type {
  AttemptStore,
  BranchLease,
  Ports,
  Repair,
  TargetCheckout,
  TargetHome,
} from './ports.ts'
import { agentRepair } from './repair/agents.ts'
import { seatRepair } from './repair/seat.ts'
import { attemptsDir, fileAttemptStore } from './update/attempts.ts'
import { targetGitEnv, targetGitOptions, UNSET_REPOSITORY_VARS } from './update/execute.ts'
import { defaultLeaseTtlSeconds, refBranchLease } from './update/lease.ts'
import { DEFAULT_REF_PREFIX, attemptsPrefix, refAttemptStore } from './update/ref-attempts.ts'

// Both run in a PR worktree, so `sh` comes only from an absolute PATH entry:
// a relative entry would resolve inside the PR's own files. Every call passes
// `UNSET_REPOSITORY_VARS`, so a git the command runs works in that worktree.
const sh = shellRunner(spawnRunner('sh', { absolutePathOnly: true }))
const shAsync = shellRunnerAsync(spawnRunnerAsync('sh', { absolutePathOnly: true }))

/**
 * A `Repair` that runs `command` with `sh -c` in the update worktree. With
 * `timeoutSeconds`, the command is killed after that long. A killed command
 * does not exit 0, so it counts as giving up. The request arrives as JSON on
 * stdin and as `PR_UPDATE_*` variables. Exit 0 claims success, and the note is
 * the command's last line of output.
 */
export function commandRepair(command: string, timeoutSeconds: number | null = null): Repair {
  return async (req) => {
    const res = await shAsync.run(command, {
      ...(timeoutSeconds === null ? {} : { timeoutMs: timeoutSeconds * 1000 }),
      cwd: req.worktree,
      input: JSON.stringify(req),
      env: {
        ...UNSET_REPOSITORY_VARS,
        PR_UPDATE_KIND: req.kind,
        PR_UPDATE_PR: String(req.pr),
        PR_UPDATE_BASE: req.base,
        PR_UPDATE_HEAD: req.head,
        PR_UPDATE_WORKTREE: req.worktree,
        PR_UPDATE_PATHS: req.paths.join('\n'),
        PR_UPDATE_REASON: req.reason,
        ...(req.replaying === undefined
          ? {}
          : {
              PR_UPDATE_COMMIT: req.replaying.sha,
              PR_UPDATE_COMMIT_SUBJECT: req.replaying.subject,
              PR_UPDATE_ONTO: req.replaying.onto,
            }),
      },
    })
    const out = (res.stdout.trim() || stderrOrError(res)).split('\n')
    return { ok: res.exitCode === 0, note: out[out.length - 1] ?? '' }
  }
}

/** Options for {@link standalonePorts} beyond its positional ones. */
export interface StandalonePortsOptions {
  /** Runs git for `locate`. Defaults to typed-git's. */
  git?: CommandRunner | undefined
  /**
   * The environment `locate` and `targetHome` read the osdlc directories and
   * the home directory from. Defaults to `process.env`.
   */
  env?: Record<string, string | undefined> | undefined
  /** Passed to `locate`'s `CheckoutLocator` as given: the CLI's SSH alias resolver, or a test's settings. */
  locator?: StandaloneLocateOptions['locator']
  /** The run's managed clones, which serve a target with no checkout (`mirror.ts`). Default none. */
  clones?: CloneLookup | undefined
}

/**
 * A standalone run has no repository registry. Its `locate` finds a `--repo`
 * target's checkout under the roots `repositories.yaml` names, or, with none,
 * beside the project root's main checkout (`locate.ts`). One locator serves
 * every call on the returned ports, so make one `Ports` per run.
 *
 * With `projectRoot`, failed updates are recorded in
 * `<projectRoot>/.pr-update/attempts/`, or, with `attempts.store: git-ref`, as refs on `remote`
 * (default `origin`) along with a per-branch update lease.
 *
 * Any other target keeps its own, in pr-update's osdlc directories (`machine.ts`), under
 * `<host>/<owner>/<name>` with the host's port left out: run worktrees in the cache's
 * `worktrees/`, kept worktrees in the state's `kept/`, and file attempts in the state's
 * `attempts/`. With `git-ref`, its record and lease are refs on its own checkout's remote, written
 * with git's hooks off, as every git call in that checkout is.
 *
 * With `opts.clones`, a target with no checkout is served from its managed clone when one exists.
 *
 * `notice` receives one-line notes for the person: the command `verify: detect` chose, where to
 * attach a `terminal` repair, and a `--repo` target with no checkout and the roots searched for it.
 */
export function standalonePorts(
  cfg?: PrUpdateConfig & Partial<PrUpdateStandaloneConfig>,
  projectRoot?: string,
  remote = 'origin',
  notice: (line: string) => void = () => {},
  opts: StandalonePortsOptions = {},
): Ports {
  const command = cfg?.repair.command ?? null
  const agent = cfg?.repair.agent ?? null
  const timeout = cfg?.repair.timeout_seconds ?? null
  const mode = cfg?.repair.mode ?? 'headless'
  const testCommand = cfg?.test_command ?? null
  return {
    locate: standaloneLocate({
      projectRoot,
      git: opts.git,
      env: opts.env,
      notice,
      locator: opts.locator,
      clones: opts.clones,
    }),
    runVerb: (verb, cwd) => sh.run(verb, { cwd, env: UNSET_REPOSITORY_VARS }),
    // A standalone run has no host registry to look up `check` in, and `test` runs only
    // `test_command`. Failing is better than running no verbs and reporting a push as
    // verified when nothing was checked.
    async resolveVerifyVerbs({ which, repo, checkout, pr }) {
      if (which === 'detect') {
        const found = detectVerifyCommand(checkout, testCommand)
        if (found === null) {
          throw new NothingDetectedError(
            `verify: detect found no test command in ${repo}'s update worktree (looked for ${DETECT_LOOKED_FOR}) — set pr_update.test_command, or set verify: 'none'`,
          )
        }
        notice(
          `verify: detect ${repo}${pr === undefined ? '' : `#${pr}`}: ${found.command}  (${found.rung})`,
        )
        return [found.command]
      }
      if (which === 'check') {
        throw new Error(
          'verify: check has no meaning in a standalone run — embed @osdlc/pr-update as a ' +
            "library and supply Ports.resolveVerifyVerbs, or set verify: 'none'",
        )
      }
      if (testCommand === null) {
        throw new Error(
          "verify: test needs test_command in a standalone run — set pr_update.test_command in the project config, or set verify: 'none'",
        )
      }
      return [testCommand]
    },
    ...(agent !== null
      ? {
          repair:
            mode === 'headless'
              ? agentRepair(agent, {
                  model: cfg?.repair.model ?? null,
                  timeoutSeconds: timeout,
                })
              : seatRepair(
                  agent,
                  mode,
                  { model: cfg?.repair.model ?? null, timeoutSeconds: timeout },
                  { notice },
                ),
        }
      : command !== null
        ? { repair: commandRepair(command, timeout) }
        : {}),
    ...(projectRoot === undefined
      ? {}
      : cfg?.attempts?.store === 'git-ref'
        ? refRecords(cfg, remote, projectRoot)
        : { attempts: fileAttemptStore(attemptsDir(projectRoot)) }),
    targetHome: (target) => standaloneTargetHome(cfg, target, opts.env, opts.git),
  }
}

/**
 * The `git-ref` record and lease of `cfg`, on `remote` of the checkout at `cwd`, with `env`
 * merged into every git call.
 */
function refRecords(
  cfg: Partial<PrUpdateStandaloneConfig> & Pick<PrUpdateConfig, 'repair'>,
  remote: string,
  cwd: string,
  env?: Record<string, string>,
): { attempts: AttemptStore; lease: BranchLease } {
  const refPrefix = cfg.attempts?.ref_prefix ?? DEFAULT_REF_PREFIX
  const git = { cwd, ...(env === undefined ? {} : { env }) }
  return {
    attempts: refAttemptStore({ remote, ...git, prefix: attemptsPrefix(refPrefix) }),
    lease: refBranchLease({
      remote,
      ...git,
      refPrefix,
      ttlMs: (cfg.lease?.ttl_seconds ?? defaultLeaseTtlSeconds(cfg.repair.timeout_seconds)) * 1000,
    }),
  }
}

/**
 * A target's own places in pr-update's directories, read from `env` when asked, so a run with
 * no `--repo` resolves none. `target.host` carries no port, so no path segment holds a `:`.
 */
function standaloneTargetHome(
  cfg: (PrUpdateConfig & Partial<PrUpdateStandaloneConfig>) | undefined,
  target: TargetCheckout,
  env: Record<string, string | undefined> | undefined,
  git: CommandRunner | undefined,
): TargetHome {
  const paths = prUpdatePaths(osdlcDirs(env === undefined ? {} : { env }))
  const own = (dir: string): string => join(dir, target.host, target.owner, target.name)
  const records =
    cfg?.attempts?.store === 'git-ref'
      ? refRecords(cfg, target.remote, target.path, refEnv(target.path, git))
      : { attempts: fileAttemptStore(own(paths.attempts)) }
  return {
    worktrees: own(paths.worktrees),
    kept: own(paths.kept),
    keptRoot: paths.kept,
    ...records,
  }
}

/**
 * The environment of a target's `git-ref` record and lease. ref-lease makes its own git client
 * and takes no runner, so the inherited `GIT_DIR` of a git hook cannot be unset there. A set
 * value wins over an inherited one, so this names the target's own repository: `GIT_DIR` and
 * `GIT_COMMON_DIR` are its common directory, its objects are its own, and no alternates are
 * added. ref-lease runs only `hash-object`, `mktree`, `commit-tree`, `update-ref`, `fetch`,
 * `push` and `ls-remote`, which read neither a work tree nor an index, so an inherited
 * `GIT_WORK_TREE` or `GIT_INDEX_FILE` changes nothing. Hooks and background maintenance are
 * off (`targetGitEnv`), as for every git call in a target, so its `fetch` in a managed clone starts
 * no `gc` there. Exported for its tests.
 */
export function refEnv(path: string, git: CommandRunner | undefined): Record<string, string> {
  const common = new Git(path, targetGitOptions(git)).try.gitCommonDir()
  if (!common.ok || common.value === null) return targetGitEnv()
  return {
    ...targetGitEnv(),
    GIT_DIR: common.value,
    GIT_COMMON_DIR: common.value,
    GIT_OBJECT_DIRECTORY: join(common.value, 'objects'),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: '',
  }
}
