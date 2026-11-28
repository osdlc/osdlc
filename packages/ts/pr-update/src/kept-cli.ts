/**
 * `pr-update kept push`: copy a failed PR's kept worktree out of pr-update's cache, as a branch
 * pushed to a remote or to a local repository, so it outlives the tree. A kept tree is evidence
 * that pr-update removes when the PR moves, under `--retry-failed` or `--discard-kept`, and that
 * a cache cleaner can remove at any time; a pushed branch is the person's.
 *
 * `kept` is a group, as `mirror` and `trust` are: a noun for what is acted on, then the verb.
 *
 * The tree is found through its record (`kept/<host>/<owner>/<name>/<number>.json` in the state
 * directory), with every check `findKept` makes, and its commit is read from the list of
 * worktrees of the git directory the record names. No git runs in the tree itself, and every git
 * runs with hooks off (`targetGitOptions`): the pushing repository's hooks never run. A local
 * repository pushed to runs its own receive hooks, as a server does: git starts its
 * `receive-pack` without the config pr-update passes.
 */

import {
  CommandError,
  UsageError,
  defineCommand,
  defineGroup,
  type Group,
} from '@osdlc/cli-tool/command'
import { isCommandFailed } from '@osdlc/command-seam'
import { homeDir } from '@osdlc/tiered-dirs'
import { Git } from '@osdlc/typed-git'
import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'

import { aliasResolver, checkCheckout, gitRunner, loadLayers, type CliSeams } from './commands.ts'
import { standaloneTrees } from './defaults.ts'
import { isGone } from './folders.ts'
import { realOr } from './real-path.ts'
import { SurveyUsageError, hostKey, parsePrKey, surveyTargets } from './survey.ts'
import { WORK_BRANCH, targetGitOptions } from './update/execute.ts'
import { findKept, keptBranch, type KeptRefusal } from './update/kept.ts'

const output = z.object({
  repo: z.string().describe('host/owner/name of the PR.'),
  number: z.number().int().describe('The PR number.'),
  worktree: z.string().describe('The kept worktree, absolute.'),
  sha: z.string().describe('The commit pushed: the kept worktree’s HEAD.'),
  to: z.string().describe('Where it was pushed: a remote name, a URL, or a local path, absolute.'),
  branch: z.string().describe('The branch it was pushed as.'),
  replaced: z
    .string()
    .nullable()
    .describe('The commit the branch held before, replaced under --force; null when it was new.'),
})

type Output = z.infer<typeof output>

function text(out: Output): string {
  const was = out.replaced === null ? '' : `, replacing ${out.replaced.slice(0, 12)}`
  return `pushed ${out.sha.slice(0, 12)} from ${out.worktree} to ${out.to} as ${out.branch}${was}\n`
}

/**
 * Why `name` cannot be a branch name, or null. git's own rules (`git check-ref-format`), so a
 * name git would refuse is a usage error before anything is read.
 */
export function branchNameProblem(name: string): string | null {
  const bad =
    name === '' ||
    name === '@' ||
    name.startsWith('-') ||
    name.startsWith('/') ||
    name.endsWith('/') ||
    name.endsWith('.') ||
    name.endsWith('.lock') ||
    name.includes('..') ||
    name.includes('//') ||
    name.includes('@{') ||
    name.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock')) ||
    // Control characters, space, and `~ ^ : ? * [ \`.
    // eslint-disable-next-line no-control-regex
    /[\x00-\x20\x7f~^:?*[\\]/.test(name)
  return bad ? `--branch ${name}: not a branch name git accepts` : null
}

/** Whether `to` reads as a URL: `scheme://...`, or scp-like `[user@]host:path`. */
function isUrl(to: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(to)) return true
  // `C:\x` and `C:/x` are Windows paths, not a host `C`.
  return /^[^/\\]+:/.test(to) && !/^[a-z]:[\\/]/i.test(to)
}

/**
 * What `--to` names, for git: a remote of the repository as written, a URL as written, else a
 * local path made absolute against `cwd` (a path starting `~/` from the home directory). git
 * runs in the git directory, so a relative path would be read from there.
 *
 * @throws UsageError when it is none of these: no remote of that name, and no folder there.
 */
function destination(
  to: string,
  remotes: readonly string[],
  cwd: string,
  env: Record<string, string | undefined>,
): string {
  if (to === '') throw new UsageError('--to is empty')
  if (remotes.includes(to) || isUrl(to)) return to
  const path = to.startsWith('~/') ? join(homeDir({ env }), to.slice(2)) : resolve(cwd, to)
  if (!existsSync(path)) {
    throw new UsageError(`--to ${to}: not a remote of this repository, a URL, or a folder`)
  }
  return isAbsolute(path) ? path : resolve(path)
}

/** The `kept` group: `push`. `git` runs git, for a test. */
export function keptCommand(seams: CliSeams = {}): Group {
  return defineGroup({
    summary: 'the kept worktrees of failed PRs: push one out of the cache',
    description:
      'update --keep-failed keeps the worktree of a PR that ended conflict or failed, where it ' +
      'ran, in pr-update’s cache, and removes it when the PR’s head or base moves, under ' +
      '--retry-failed or --discard-kept, or with the clone. A cache cleaner can remove it at any ' +
      'time. kept push copies one out as a branch.',
    commands: {
      push: defineCommand({
        summary: 'push a kept worktree’s HEAD to a remote or a local repository, as a branch',
        description:
          'Finds the kept worktree of <pr> through its record, and pushes its HEAD commit to ' +
          '--to as --branch (default pr-update/failed-<owner>-<name>-<number>). <pr> is a ' +
          'number of the project root’s repository (its origin remote), or of --repo, or ' +
          'owner/name#<number>. --to is a remote of the repository, a URL, or a local path. A ' +
          'branch that is there already is refused, unless --force, which replaces it only ' +
          'while it holds the commit read just before (--force-with-lease). The tree is not ' +
          'changed. Hooks are off in the repository pushed from; a local repository pushed to ' +
          'runs its own receive hooks, as a server does. Exits 1 when the PR has no kept ' +
          'worktree, the branch is there without --force, or the push fails.',
        positionals: [
          {
            name: 'pr',
            required: true,
            help: 'The PR: a number, or owner/name#<number>.',
          },
        ],
        flags: {
          to: {
            kind: 'string',
            valueName: 'remote-or-path',
            required: true,
            help: 'Where to push: a remote name, a URL, or a local repository’s path.',
          },
          branch: {
            kind: 'string',
            valueName: 'name',
            help: 'The branch to push as. Default pr-update/failed-<owner>-<name>-<number>.',
          },
          force: {
            kind: 'boolean',
            help: 'Replace a branch that is there already, with --force-with-lease.',
          },
          repo: {
            kind: 'string',
            valueName: 'owner/name',
            help: 'The PR’s repository, as owner/name or host/owner/name, instead of the project root’s.',
          },
        },
        examples: [
          'kept push 7 --to origin',
          'kept push 7 --to ~/src/api --branch look-at-7',
          'kept push acme/api#7 --to git@github.com:me/api.git --force',
        ],
        output,
        kind: 'kept-push',
        schemaVersion: 1,
        run({ flags, positionals }, ctx) {
          checkCheckout(ctx, seams)
          const [word = ''] = positionals
          const key = parsePrKey(word)
          const number = key?.number ?? (/^[1-9]\d*$/.test(word) ? Number(word) : null)
          if (number === null || !Number.isSafeInteger(number)) {
            throw new UsageError(`<pr> ${word}: not a PR number or owner/name#<number>`)
          }
          if (key !== null && flags.repo !== undefined) {
            throw new UsageError(`<pr> ${word} names its repository; leave out --repo`)
          }
          if (flags.branch !== undefined) {
            const problem = branchNameProblem(flags.branch)
            if (problem !== null) throw new UsageError(problem)
          }
          const repoFlag = key?.repo ?? flags.repo
          const git = gitRunner(seams)
          const layers = loadLayers(ctx, seams)
          let found
          try {
            found = surveyTargets(
              { remote: 'origin', repo: repoFlag === undefined ? [] : [repoFlag] },
              {
                projectRoot: ctx.cwd,
                git,
                ports: { locate: () => null },
                codeHostOverride: layers.merged.code_host.override,
                resolveAlias: aliasResolver(seams, (l) => ctx.note(l)),
              },
            )
          } catch (e) {
            if (e instanceof SurveyUsageError) throw new UsageError(e.message)
            throw e
          }
          const t = found.targets[0]
          if (t === undefined) {
            throw new UsageError(
              'no --repo, and the working directory has no origin remote naming a repository',
            )
          }
          const [owner = '', name = ''] = t.repo.split('/')
          const host = hostKey(t.host ?? 'github.com')
          const repo = `${host}/${t.repo}`
          const trees = standaloneTrees({ host, owner, name }, ctx.env)
          const refused: KeptRefusal[] = []
          const record = findKept(
            { dir: trees.kept, trees: trees.worktrees },
            t.repo,
            number,
            (r) => refused.push(r),
          )
          const notKept = (why: string): CommandError =>
            new CommandError(`${repo}#${number}: ${why}`, { code: 'not-kept' })
          if (record === null) {
            throw notKept(
              refused.length > 0
                ? `its kept record ${refused[0]!.record} is refused: ${refused[0]!.reason}`
                : 'no kept worktree (update --apply --keep-failed keeps one when the PR fails)',
            )
          }
          if (record.gitDir === undefined || isGone(record.gitDir)) {
            throw notKept(`the git directory of its kept worktree ${record.path} is gone`)
          }
          // Its owner's list, not git in the tree: a folder that is not a worktree can hold a
          // `.git` file that points anywhere.
          const owning = new Git(record.gitDir, targetGitOptions(git))
          const entry = owning
            .worktrees()
            .find((w) => w.path === record.path || realOr(w.path) === realOr(record.path))
          if (entry === undefined || entry.head === null) {
            throw notKept(`${record.path} is not a worktree of ${record.gitDir}`)
          }
          if (entry.branch?.startsWith(`${WORK_BRANCH}-`) === true) {
            throw notKept(`${record.path} is a run’s worktree, on its scratch branch`)
          }
          const sha = entry.head
          const to = destination(flags.to, owning.remotes(), ctx.cwd, ctx.env)
          const branch = flags.branch ?? keptBranch(t.repo, number)
          const ref = `refs/heads/${branch}`
          const failed = (e: unknown): CommandError =>
            new CommandError(
              `cannot push to ${to}: ${isCommandFailed(e) ? e.result.stderr.trim() || e.message : (e as Error).message}`,
              { code: 'push-failed' },
            )
          let there: string | null
          try {
            there = owning.lsRemote(to, ref).find((r) => r.ref === ref)?.sha ?? null
          } catch (e) {
            throw failed(e)
          }
          if (there !== null && flags.force !== true) {
            throw new CommandError(
              `${to} has ${branch} already, at ${there.slice(0, 12)}; pass --force to replace it`,
              { code: 'branch-exists' },
            )
          }
          let report
          try {
            report = owning.push(to, `${sha}:${ref}`, { forceWithLease: { ref, expect: there } })
          } catch (e) {
            throw failed(e)
          }
          const rejected = report.refs.find((r) => r.flag === '!')
          if (rejected !== undefined) {
            throw new CommandError(
              `${to} refused ${branch}: ${rejected.summary}${report.stderr.trim() === '' ? '' : `\n${report.stderr.trim()}`}`,
              { code: 'push-failed' },
            )
          }
          return { repo, number, worktree: record.path, sha, to, branch, replaced: there }
        },
        text,
      }),
    },
  })
}
