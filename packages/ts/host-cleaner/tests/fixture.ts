import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import type { HostAdapter, HostRow } from '../src/adapter.ts'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
}

export function sh(cwd: string, args: string[]): string {
  return new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()
}

export interface Fixture {
  root: string
  /** A merged branch, safe to delete. */
  merged: string
  /** A branch with a commit main lacks: `review`, needs `abandon-unmerged`. */
  topic: string
  /** A directory a host row's adapter may delete. */
  scratch: string
  cleanup(): void
}

/** A repository with a merged branch, an unmerged one and no remote. */
export function buildFixture(): Fixture {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-')))
  makeGitFixture({ dir, initialBranch: 'main' })
  sh(dir, ['commit', '--allow-empty', '-m', 'initial'])
  sh(dir, ['branch', 'merged-a'])
  sh(dir, ['checkout', '-q', '-b', 'topic'])
  sh(dir, ['commit', '--allow-empty', '-m', 'wip'])
  sh(dir, ['checkout', '-q', 'main'])
  return {
    root: dir,
    merged: 'branch:merged-a',
    topic: 'branch:topic',
    scratch: join(dir, '.git', 'scratch'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

export function hostRow(over: Partial<HostRow> = {}): HostRow {
  return {
    id: 'artifact:cache',
    adapter: 'fake',
    kind: 'artifact',
    name: 'cache',
    verdict: 'delete',
    action: 'remove',
    why: 'idle for a week',
    risks: [],
    blockers: [],
    commands: ['rm -r cache'],
    notes: [],
    evidence: { bytes: 10 },
    ...over,
  }
}

/** An adapter that owns `rows` and records what it was asked to execute. */
export function fakeAdapter(
  rows: () => HostRow[],
  over: Partial<HostAdapter> = {},
): HostAdapter & { executed: string[] } {
  const executed: string[] = []
  return {
    name: 'fake',
    detect: () => true,
    gather: () => rows(),
    execute: (step) => {
      executed.push(step.row.id)
      return `removed ${step.row.name}`
    },
    executed,
    ...over,
  }
}
