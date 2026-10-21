/**
 * Branch mode, against real git: `update --branch` names a PR by its head
 * branch and, after a push, moves the working directory's checkout when that
 * loses nothing. Only `gh` is faked, answering from the refs of a real bare
 * origin.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import type { CommandRunner } from '@osdlc/command-seam'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import { main } from '../src/cli.ts'
import { output as updateOutput } from '../src/update.ts'

const scratch = mkdtempSync(join(tmpdir(), 'pr-update-branch-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let n = 0

/**
 * A bare origin whose `main` has moved past two PR branches, `topic` (#1) and
 * `other` (#2), with the worker checked out on `topic` at its pushed head.
 */
function repo() {
  const fx = makeBareAndWorker({
    initialBranch: 'main',
    parent: mkdtempSync(join(scratch, `pair${n++}-`)),
  })
  const { worker } = fx
  worker.commit('initial', { 'shared.txt': 'base\n' })
  worker.git.push('origin', 'main')
  for (const [branch, file] of [
    ['other', 'o.txt'],
    ['topic', 't.txt'],
  ] as const) {
    worker.git.checkout('main', { branch })
    worker.commit(`${branch} work`, { [file]: `${branch}\n` })
    worker.git.push('origin', branch)
  }
  worker.git.checkout('main')
  worker.commit('main moves', { 'm.txt': 'm\n' })
  worker.git.push('origin', 'main')
  worker.git.configSet('remote.origin.url', 'https://github.com/o/r.git')
  worker.git.configSet('remote.origin.pushurl', fx.bare.dir)
  worker.git.checkout('topic')

  const listed = (number: number, branch: string) => ({
    number,
    state: 'OPEN',
    title: branch,
    url: `https://github.com/o/r/pull/${number}`,
    baseRefName: 'main',
    headRefName: branch,
    headRefOid: worker.git.resolveRef(`origin/${branch}`),
  })
  const gh: CommandRunner = {
    run: () => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify([listed(1, 'topic'), listed(2, 'other')]),
    }),
  }
  const env = { PATH: process.env.PATH ?? '', XDG_STATE_HOME: join(scratch, 'state'), ...IDENTITY }
  const go = async (...argv: string[]) => {
    const ctx = captureContext({ cwd: worker.dir, env })
    const code = await main(argv, ctx, { gh })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }
  return { fx, worker, go }
}

describe('update --branch', () => {
  test('AC-1: updates only the checked-out branch’s PR and moves a clean checkout to the pushed head', async () => {
    const { fx, worker, go } = repo()
    try {
      const oldOther = worker.git.resolveRef('origin/other')
      const r = await go('update', '--branch', '--apply', '--no-fetch', '--json')
      expect(r.err).toBe('')
      expect(r.code).toBe(EXIT.ok)
      const out = JSON.parse(r.out)
      expect(out.results.map((x: { number: number }) => x.number)).toEqual([1])
      expect(out.results[0]).toMatchObject({
        status: 'updated',
        pushed: true,
        strategy: 'rebase',
        localCheckout: { updated: true },
      })

      // The remote branch was rebased onto main, the other PR left alone.
      const pushed = worker.git.resolveRef('origin/topic')!
      expect(worker.git.isAncestor(worker.git.resolveRef('main')!, pushed)).toBe(true)
      expect(worker.git.resolveRef('origin/other')).toBe(oldOther)
      // And the checkout followed it, with nothing left over.
      expect(worker.git.resolveRef('HEAD')).toBe(pushed)
      expect(worker.git.currentBranch()).toBe('topic')
      expect(worker.git.statusEntries().filter((e) => !e.path.startsWith('.pr-update/'))).toEqual(
        [],
      )
    } finally {
      fx.cleanup()
    }
  })

  test('AC-1: a dirty checkout is left alone, and the result says why', async () => {
    const { fx, worker, go } = repo()
    try {
      appendFileSync(join(worker.dir, 't.txt'), 'wip\n')
      const before = worker.git.resolveRef('HEAD')
      const r = await go(
        'update',
        '--branch',
        'topic',
        '--apply',
        '--no-fetch',
        '--strategy',
        'merge',
        '--json',
      )
      expect(r.code).toBe(EXIT.ok)
      const [res] = JSON.parse(r.out).results
      expect(res.status).toBe('updated')
      expect(res.localCheckout.updated).toBe(false)
      expect(res.localCheckout.detail).toContain('uncommitted')
      expect(worker.git.resolveRef('HEAD')).toBe(before)
      expect(worker.git.resolveRef('origin/topic')).not.toBe(before)
    } finally {
      fx.cleanup()
    }
  })

  test('a checkout on another branch is left alone', async () => {
    const { fx, worker, go } = repo()
    try {
      worker.git.checkout('main')
      const r = await go(
        'update',
        '--branch',
        'topic',
        '--apply',
        '--no-fetch',
        '--strategy',
        'merge',
        '--json',
      )
      const [res] = JSON.parse(r.out).results
      expect(res.localCheckout).toMatchObject({ updated: false })
      expect(res.localCheckout.detail).toContain('on main')
      expect(worker.git.currentBranch()).toBe('main')
    } finally {
      fx.cleanup()
    }
  })

  test('a rehearsal moves nothing and reports no checkout', async () => {
    const { fx, worker, go } = repo()
    try {
      const before = worker.git.resolveRef('HEAD')
      const r = await go('update', '--branch', '--no-fetch', '--json')
      const [res] = JSON.parse(r.out).results
      expect(res.localCheckout).toBeUndefined()
      expect(worker.git.resolveRef('HEAD')).toBe(before)
    } finally {
      fx.cleanup()
    }
  })

  test('no PR for the branch is a usage error, for update and survey', async () => {
    const { fx, go } = repo()
    try {
      for (const cmd of ['update', 'survey']) {
        const r = await go(cmd, '--branch', 'no-such', '--no-fetch')
        expect(r.code).toBe(EXIT.usage)
        expect(r.err).toContain("no open PR has head branch 'no-such'")
      }
    } finally {
      fx.cleanup()
    }
  })

  test('survey --branch reports the PR and no others', async () => {
    const { fx, go } = repo()
    try {
      const r = await go('survey', '--branch', '--no-fetch', '--json')
      expect(r.code).toBe(EXIT.ok)
      expect(JSON.parse(r.out).prs.map((p: { number: number }) => p.number)).toEqual([1])
    } finally {
      fx.cleanup()
    }
  })

  test('a bare --branch on a detached HEAD is a usage error', async () => {
    const { fx, worker, go } = repo()
    try {
      worker.git.raw(['checkout', '--detach'])
      const r = await go('update', '--branch')
      expect(r.code).toBe(EXIT.usage)
      expect(r.err).toContain('not on a branch')
    } finally {
      fx.cleanup()
    }
  })
})

describe('update --report', () => {
  test('AC-10: writes schema-valid JSON on success, matching what is printed', async () => {
    const { fx, worker, go } = repo()
    try {
      const file = join(worker.dir, 'out', 'report.json')
      const r = await go('update', '--branch', '--apply', '--no-fetch', '--json', '--report', file)
      expect(r.code).toBe(EXIT.ok)
      const report = updateOutput.parse(JSON.parse(readFileSync(file, 'utf8')))
      expect(report).toEqual(JSON.parse(r.out))
      expect(report.results[0]).toMatchObject({ number: 1, status: 'updated' })
      // Atomic: no temp file left beside it.
      expect(readdirSync(join(worker.dir, 'out'))).toEqual(['report.json'])
    } finally {
      fx.cleanup()
    }
  })

  test('AC-10: writes it on a conflict exit too, naming the fallback and the paths', async () => {
    const { fx, worker, go } = repo()
    try {
      // Both sides change shared.txt, which no resolver claims.
      worker.git.checkout('topic')
      worker.commit('topic edits shared', { 'shared.txt': 'topic\n' })
      worker.git.push('origin', 'topic')
      worker.git.checkout('main')
      worker.commit('main edits shared', { 'shared.txt': 'main\n' })
      worker.git.push('origin', 'main')
      worker.git.checkout('topic')

      const file = join(scratch, `conflict-${n++}.json`)
      const r = await go('update', '--branch', '--apply', '--no-fetch', '--report', file)
      expect(r.code).toBe(EXIT.error)
      expect(existsSync(file)).toBe(true)
      const report = updateOutput.parse(JSON.parse(readFileSync(file, 'utf8')))
      const [res] = report.results
      expect(res).toMatchObject({ number: 1, status: 'conflict', strategy: 'merge' })
      expect(res!.strategyFallback).toContain('shared.txt')
      expect(res!.conflicts?.map((c) => c.path)).toEqual(['shared.txt'])
      expect(report.counts.conflict).toBe(1)
    } finally {
      fx.cleanup()
    }
  })
})
