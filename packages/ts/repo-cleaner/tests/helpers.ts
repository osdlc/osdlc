import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type CommandResult, type CommandRunner, spawnRunner } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

/** Run git in `cwd` with the fixture identity; a failing command throws. */
export function sh(cwd: string, args: string[]): string {
  return new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()
}

/** Like {@link sh} with the arguments the other way round, and a failing command yields ''. */
export function git(args: string[], cwd: string): string {
  const result = new Git(cwd, { env: { ...IDENTITY } }).raw(args)
  return result.exitCode === 0 ? result.stdout.trim() : ''
}

/** Stage everything in `cwd` and commit it, even when nothing changed. */
export function commit(cwd: string, message: string): void {
  git(['add', '-A'], cwd)
  git(['commit', '--allow-empty', '-m', message], cwd)
}

/** Write `content` to `file` under `cwd` and commit it; returns the new commit's sha. */
export function commitFile(cwd: string, file: string, content: string, message: string): string {
  writeFileSync(join(cwd, file), content, 'utf-8')
  commit(cwd, message)
  return sh(cwd, ['rev-parse', 'HEAD'])
}

/**
 * A new repository on `main` with one commit, in a fresh temp directory. The
 * path is resolved, because macOS puts the temp dir behind a symlink and git
 * answers with the resolved path.
 */
export function newRepo(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)))
  makeGitFixture({ dir, initialBranch: 'main' })
  commitFile(dir, 'README.md', '# fixture\n', 'initial commit')
  return dir
}

export interface CannedPr {
  number: number
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  headRefName: string
  headRefOid: string
  baseRefName?: string
  isCrossRepository?: boolean
  headRepositoryOwner?: { login: string }
}

/**
 * A `gh` that answers `pr list` with `prs` and the fork probe, and fails everything else.
 * `installed: false` fails `--version`, `authenticated: false` fails `auth`,
 * and `listError` fails `pr list` with that stderr. `pr list` honours
 * `--state` and `--limit` (`--limit` keeps the first rows, so list `prs` newest first). `fork` is
 * the parent `repos/<owner>/<name>` reports; absent, the repository is not a
 * fork. `byRepo` and `forks` answer per repository, keyed `owner/name`: a
 * `pr list --repo <owner/name>` lists `byRepo`'s rows for it, and `api
 * repos/<owner/name>` reports `forks`' parent for it; a repository in neither
 * falls back to `prs` and `fork`. `calls` records every argv.
 */
export function cannedGh(
  prs: CannedPr[],
  opts: {
    installed?: boolean
    authenticated?: boolean
    listError?: string
    fork?: string
    /** `auth status --hostname <h>` succeeds only for these hosts. */
    signedInHosts?: string[]
    /** `api repos/...` fails, as under a rate limit. */
    apiFails?: boolean
    /** The fork probe reports a fork with no parent name. */
    forkWithoutParent?: boolean
    /** `pr list --repo <owner/name>` answers with these instead of `prs`. */
    byRepo?: Record<string, CannedPr[]>
    /** `api repos/<owner/name>` reports this parent instead of `fork`. */
    forks?: Record<string, string>
  } = {},
): CommandRunner & { calls: string[][] } {
  const calls: string[][] = []
  const shape = (list: CannedPr[]) =>
    list.map((pr) => ({
      baseRefName: 'main',
      isCrossRepository: false,
      mergedAt: pr.state === 'MERGED' ? '2020-01-02T00:00:00Z' : null,
      title: `PR ${pr.number}`,
      url: `https://example.invalid/pull/${pr.number}`,
      ...pr,
    }))
  const rows = shape(prs)
  const byRepo = new Map(Object.entries(opts.byRepo ?? {}).map(([k, v]) => [k, shape(v)]))
  // `--repo` may carry a host first: `github.com/acme/app`.
  const project = (named: string | undefined) => named?.split('/').slice(-2).join('/')
  return {
    calls,
    run(argv) {
      calls.push([...argv])
      const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' })
      const fail = (stderr: string) => ({ exitCode: 1, stdout: '', stderr })
      if (argv[0] === '--version') return opts.installed === false ? fail('not installed') : ok()
      if (argv[0] === 'auth') {
        const host = argv[argv.indexOf('--hostname') + 1]
        if (opts.signedInHosts !== undefined && argv.includes('--hostname')) {
          return opts.signedInHosts.includes(host!) ? ok() : fail('not signed in')
        }
        return opts.authenticated === false ? fail('not signed in') : ok()
      }
      if (argv[0] === 'pr' && argv[1] === 'list') {
        if (opts.listError !== undefined) return fail(opts.listError)
        const flag = (name: string) => argv[argv.indexOf(name) + 1]
        const state = flag('--state')
        const repo = argv.includes('--repo') ? project(flag('--repo')) : undefined
        const listed = (repo === undefined ? undefined : byRepo.get(repo)) ?? rows
        const limit = Number(flag('--limit') ?? listed.length)
        const wanted = listed.filter((r) => state !== 'open' || r.state === 'OPEN')
        return ok(JSON.stringify(wanted.slice(0, limit)))
      }
      if (argv[0] === 'api') {
        if (opts.apiFails === true) return fail('HTTP 403: rate limit')
        if (opts.forkWithoutParent === true) return ok('{"fork":true}')
        const endpoint = argv.find((a) => a.startsWith('repos/'))
        const parent = opts.forks?.[endpoint?.slice('repos/'.length) ?? ''] ?? opts.fork
        return ok(
          JSON.stringify(
            parent === undefined ? { fork: false } : { fork: true, parent: { full_name: parent } },
          ),
        )
      }
      return { exitCode: 1, stdout: '', stderr: 'not canned' }
    },
  }
}

export interface CannedMr {
  iid: number
  state: 'opened' | 'merged' | 'closed' | 'locked'
  source_branch: string
  sha: string
  target_branch?: string
  /** Defaults to the target project's id, so the MR is not a fork's. */
  source_project_id?: number
}

/**
 * A `glab` that answers `api …/merge_requests` with `mrs` (100 to a page,
 * filtered by `source_branch` and `state=opened`) and fails everything else. `calls` records
 * every argv it was given.
 */
export function cannedGlab(
  mrs: CannedMr[],
  opts: { installed?: boolean; authenticated?: boolean } = {},
): CommandRunner & { calls: string[][] } {
  const rows = mrs.map((mr) => ({
    target_branch: 'main',
    source_project_id: 1,
    target_project_id: 1,
    merged_at: mr.state === 'merged' ? '2020-01-02T00:00:00Z' : null,
    title: `MR ${mr.iid}`,
    web_url: `https://gitlab.example.invalid/-/merge_requests/${mr.iid}`,
    ...mr,
  }))
  const calls: string[][] = []
  return {
    calls,
    run(argv) {
      calls.push([...argv])
      const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' })
      if (opts.installed === false) {
        return { exitCode: 1, stdout: '', stderr: '', neverExited: true, reason: 'spawn' as const }
      }
      if (argv[0] === '--version') return ok('glab 1.50.0')
      if (argv[0] === 'auth') {
        return opts.authenticated === false ? { exitCode: 1, stdout: '', stderr: 'no token' } : ok()
      }
      if (argv[0] === 'api') {
        const url = new URL(`https://x/${argv.at(-1)!}`)
        const page = Number(url.searchParams.get('page') ?? '1')
        const branch = url.searchParams.get('source_branch')
        const state = url.searchParams.get('state')
        const matching = rows.filter(
          (r) =>
            (branch === null || r.source_branch === branch) &&
            (state !== 'opened' || r.state === 'opened'),
        )
        return ok(JSON.stringify(matching.slice((page - 1) * 100, page * 100)))
      }
      return { exitCode: 1, stdout: '', stderr: 'not canned' }
    },
  }
}

/** A git runner that answers some argv itself and runs the rest for real. */
export function interposedRunner(
  answer: (argv: string[]) => CommandResult | undefined,
): CommandRunner {
  const real = spawnRunner('git', { absolutePathOnly: true })
  return {
    run(argv, opts) {
      return answer(argv) ?? real.run(argv, opts)
    },
  }
}

/** Whether `argv` is `git remote get-url origin`. */
export function isGetUrlOrigin(argv: string[]): boolean {
  return getUrlOf(argv) === 'origin'
}

/** The remote `argv` asks the URL of, when it is `git remote get-url <name>`. */
export function getUrlOf(argv: string[]): string | null {
  return argv.includes('remote') && argv.includes('get-url') ? (argv.at(-1) ?? null) : null
}

/** One remote of a {@link withRemotes} fixture. */
export interface RemoteSpec {
  /** Its default branch: what its `HEAD` points at. Default `main`. */
  defaultBranch?: string
  /** `owner/name` on GitHub: `git remote get-url` reports it there, so its pull requests are looked up with `gh --repo`. */
  github?: string
}

export interface Remotes {
  /** The checkout, on `main`, tracking the first remote. */
  root: string
  /** Each remote's bare repository. */
  bare: Record<string, string>
  /**
   * A git runner for the sweep: real, except that `git remote get-url` reports
   * each remote's GitHub URL where it has one.
   */
  git: CommandRunner
  /** Commit `file` on a new `branch` from `main`, push it to `remote`, and return to `main`; the commit's sha. */
  pushBranch(remote: string, branch: string): string
  cleanup(): void
}

/**
 * A checkout with a bare repository for each of `remotes`, in order, each
 * holding the checkout's `main` as its own default branch, with every
 * `refs/remotes/<name>/HEAD` set. For a fork and its parent, or remotes with
 * different default branches.
 */
export function withRemotes(prefix: string, remotes: Record<string, RemoteSpec>): Remotes {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)))
  const root = join(parent, 'checkout')
  mkdirSync(root)
  makeGitFixture({ dir: root, initialBranch: 'main' })
  commitFile(root, 'README.md', '# fixture\n', 'initial commit')
  const bare: Record<string, string> = {}
  for (const [name, spec] of Object.entries(remotes)) {
    const dir = join(parent, `${name}.git`)
    const head = spec.defaultBranch ?? 'main'
    makeGitFixture({ dir, bare: true, initialBranch: head })
    sh(root, ['remote', 'add', name, dir])
    sh(root, ['push', '-q', name, `main:${head}`])
    sh(root, ['remote', 'set-head', name, '--auto'])
    bare[name] = dir
  }
  const first = Object.keys(remotes)[0]
  if (first !== undefined) {
    sh(root, [
      'branch',
      '-q',
      '--set-upstream-to',
      `${first}/${remotes[first]!.defaultBranch ?? 'main'}`,
    ])
  }
  const git = interposedRunner((argv) => {
    const named = getUrlOf(argv)
    const project = named === null ? undefined : remotes[named]?.github
    return project === undefined
      ? undefined
      : { exitCode: 0, stdout: `https://github.com/${project}.git\n`, stderr: '' }
  })
  return {
    root,
    bare,
    git,
    pushBranch(remote, branch) {
      sh(root, ['checkout', '-q', '-b', branch, 'main'])
      const sha = commitFile(
        root,
        `${branch.replaceAll('/', '-')}.txt`,
        `${branch}\n`,
        `feat: ${branch}`,
      )
      sh(root, ['push', '-q', remote, branch])
      sh(root, ['checkout', '-q', 'main'])
      return sha
    },
    cleanup: () => rmSync(parent, { recursive: true, force: true }),
  }
}
