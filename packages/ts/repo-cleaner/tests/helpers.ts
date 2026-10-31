import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'
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
}

/** A `gh` that answers `pr list` with `prs` and fails everything else. */
export function cannedGh(prs: CannedPr[]): CommandRunner {
  const rows = prs.map((pr) => ({
    baseRefName: 'main',
    isCrossRepository: false,
    mergedAt: pr.state === 'MERGED' ? '2020-01-02T00:00:00Z' : null,
    title: `PR ${pr.number}`,
    url: `https://example.invalid/pull/${pr.number}`,
    ...pr,
  }))
  return {
    run(argv) {
      const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' })
      if (argv[0] === '--version' || argv[0] === 'auth') return ok()
      if (argv[0] === 'pr' && argv[1] === 'list') return ok(JSON.stringify(rows))
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
 * filtered by `source_branch`) and fails everything else. `calls` records
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
        const matching = rows.filter((r) => branch === null || r.source_branch === branch)
        return ok(JSON.stringify(matching.slice((page - 1) * 100, page * 100)))
      }
      return { exitCode: 1, stdout: '', stderr: 'not canned' }
    },
  }
}
