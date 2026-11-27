import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { runChecked, spawnRunner } from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'
import { afterEach } from 'vitest'

import { openRepo, type Repo } from '../src/git/repo.ts'

const git = spawnRunner('git')
const dirs: string[] = []

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A throwaway repository on branch `main`, removed after the test. */
export interface TestRepo {
  dir: string
  git(...argv: string[]): string
  write(files: Record<string, string | Buffer>): void
  /** Writes `files`, stages everything and commits; returns the commit. */
  commit(message: string, files?: Record<string, string | Buffer>): string
  remove(...paths: string[]): void
  open(gh?: Record<string, { stdout: string }>): Repo
}

export function testRepo(): TestRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'code-stats-test-')))
  dirs.push(dir)
  const run = (...argv: string[]) =>
    runChecked(git, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...argv], {
      cwd: dir,
      env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    }).stdout.trim()
  run('init', '-q', '-b', 'main')
  const write = (files: Record<string, string | Buffer>) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
  }
  return {
    dir,
    git: run,
    write,
    commit(message, files = {}) {
      write(files)
      run('add', '-A')
      run('commit', '-q', '--allow-empty', '-m', message)
      return run('rev-parse', 'HEAD')
    },
    remove(...paths) {
      for (const p of paths) rmSync(join(dir, p))
    },
    open(gh = {}) {
      return openRepo(dir, { gh: fakeRunner(gh).runner })
    },
  }
}
