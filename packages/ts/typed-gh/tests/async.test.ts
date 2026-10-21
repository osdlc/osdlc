/**
 * `AsyncGh` and the verbs added alongside it. Offline: a fake
 * `AsyncCommandRunner` records argv and replays canned results, and a parity
 * block pins that `Gh` and `AsyncGh` build identical argv from the shared
 * verb table.
 */

import { describe, expect, test } from 'vitest'

import {
  AsyncGh,
  CommandFailed,
  Gh,
  api,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../src/index.ts'
import { asAsync } from '@osdlc/command-seam'

function recorder(results: CommandResult[] = [{ exitCode: 0, stdout: '', stderr: '' }]) {
  const calls: string[][] = []
  let i = 0
  const runner: AsyncCommandRunner = {
    async run(argv) {
      calls.push([...argv])
      const r = results[Math.min(i, results.length - 1)]!
      i += 1
      return r
    },
  }
  return { calls, runner }
}

const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const FAIL: CommandResult = { exitCode: 1, stdout: '', stderr: 'boom' }

describe('AsyncGh — tri-modal contract', () => {
  test('queries resolve to null on failure and never reject', async () => {
    const { runner } = recorder([FAIL])
    const gh = new AsyncGh('/repo', { runner })
    expect(await gh.prList()).toBeNull()
    expect(await gh.prView(1)).toBeNull()
    expect(await gh.prBody(1)).toBeNull()
    expect(await gh.labelList()).toBeNull()
  })

  test('mutations reject with CommandFailed', async () => {
    const { runner } = recorder([FAIL])
    const gh = new AsyncGh('/repo', { runner })
    await expect(gh.editPr(1, { title: 't' })).rejects.toBeInstanceOf(CommandFailed)
    await expect(gh.prComment(1, 'hi')).rejects.toBeInstanceOf(CommandFailed)
    await expect(gh.prUpdateBranch(1)).rejects.toBeInstanceOf(CommandFailed)
  })

  test('raw is unchecked, rawChecked rejects', async () => {
    const { runner } = recorder([FAIL])
    const gh = new AsyncGh('/repo', { runner })
    expect((await gh.raw(['x'])).exitCode).toBe(1)
    await expect(gh.rawChecked(['x'])).rejects.toBeInstanceOf(CommandFailed)
  })

  test('openPrFor discards a prefix-only match', async () => {
    const rows = [
      { number: 2, state: 'OPEN', headRefName: 'feature/foo-2', url: 'u2' },
      { number: 1, state: 'OPEN', headRefName: 'feature/foo', url: 'u1' },
    ]
    const { runner } = recorder([ok(JSON.stringify(rows))])
    const pr = await new AsyncGh('/repo', { runner }).openPrFor('feature/foo')
    expect(pr?.number).toBe(1)
  })

  test('prViewSettled re-asks while the merge state is UNKNOWN', async () => {
    const unknown = ok(JSON.stringify({ number: 1, mergeable: 'UNKNOWN' }))
    const settled = ok(
      JSON.stringify({ number: 1, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' }),
    )
    const { runner, calls } = recorder([unknown, settled])
    const sleeps: number[] = []
    const pr = await new AsyncGh('/repo', { runner }).prViewSettled(1, {
      sleep: async (ms) => void sleeps.push(ms),
    })
    expect(pr?.mergeable).toBe('MERGEABLE')
    expect(calls).toHaveLength(2)
    expect(sleeps).toHaveLength(1)
  })

  test('prBody trims a trailing CRLF as well as a trailing LF', async () => {
    const { runner } = recorder([ok('x\r\n')])
    expect(await new AsyncGh('/repo', { runner }).prBody(7)).toBe('x')
  })

  test('a sync runner drives it through asAsync', async () => {
    const sync: CommandRunner = { run: () => ok('hello\n') }
    expect(await new AsyncGh('/repo', { runner: asAsync(sync) }).prBody(3)).toBe('hello')
  })
})

describe('Gh and AsyncGh share one verb table', () => {
  test('AsyncGh has every Gh method', () => {
    const methods = (c: { prototype: object }) =>
      Object.getOwnPropertyNames(c.prototype)
        .filter((n) => n !== 'constructor')
        .sort()
    expect(methods(AsyncGh)).toEqual(methods(Gh))
  })

  test('identical argv for the same calls', async () => {
    const s = { calls: [] as string[][] }
    const syncRunner: CommandRunner = {
      run(argv) {
        s.calls.push([...argv])
        return ok('[]')
      },
    }
    const a = recorder([ok('[]')])
    const g = new Gh('/repo', { runner: syncRunner })
    const ag = new AsyncGh('/repo', { runner: a.runner })
    g.prList({ head: 'b', limit: 3 })
    await ag.prList({ head: 'b', limit: 3 })
    g.prBody(7)
    await ag.prBody(7)
    g.prComment(7, 'c')
    await ag.prComment(7, 'c')
    g.prDiff(7)
    await ag.prDiff(7)
    g.prUpdateBranch(7, 'rebase')
    await ag.prUpdateBranch(7, 'rebase')
    g.editPrBody(7, 'b')
    await ag.editPrBody(7, 'b')
    g.api('repos/{owner}/{repo}/pulls', { etag: 'W/"1"' })
    await ag.api('repos/{owner}/{repo}/pulls', { etag: 'W/"1"' })
    expect(a.calls).toEqual(s.calls)
  })
})

describe('new verbs — argv', () => {
  test('prBody, editPrBody, prComment, prUpdateBranch', async () => {
    const { runner, calls } = recorder([ok('body\n\n')])
    const gh = new AsyncGh('/repo', { runner })
    expect(await gh.prBody(9)).toBe('body')
    await gh.editPrBody(9, 'new')
    await gh.prComment(9, 'hi')
    await gh.prUpdateBranch(9)
    await gh.prUpdateBranch(9, 'rebase')
    expect(calls).toEqual([
      ['pr', 'view', '9', '--json', 'body', '-q', '.body'],
      ['pr', 'edit', '9', '--body', 'new'],
      ['pr', 'comment', '9', '--body', 'hi'],
      ['pr', 'update-branch', '9'],
      ['pr', 'update-branch', '9', '--rebase'],
    ])
  })

  test('api without headers is a plain GET with parsed JSON', async () => {
    const { runner, calls } = recorder([ok('[{"id":1}]')])
    const r = await new AsyncGh('/repo', { runner }).api('repos/{owner}/{repo}/issues/1/comments')
    expect(calls[0]).toEqual(['api', 'repos/{owner}/{repo}/issues/1/comments'])
    expect(r).toMatchObject({ ok: true, status: 200, etag: null, body: [{ id: 1 }] })
  })

  test('api failure is a value', async () => {
    const { runner } = recorder([FAIL])
    const r = await new AsyncGh('/repo', { runner }).api('x')
    expect(r).toMatchObject({ ok: false, status: 0, body: null, stderr: 'boom' })
    expect(r.error).toBeUndefined()
  })

  test("api on a failed spawn keeps stderr empty and carries the runner's error", async () => {
    const { runner } = recorder([
      {
        exitCode: 1,
        stdout: '',
        stderr: '',
        neverExited: true,
        reason: 'spawn',
        error: 'spawn gh ENOENT',
      },
    ])
    const r = await new AsyncGh('/repo', { runner }).api('x')
    expect(r).toMatchObject({ ok: false, stderr: '', error: 'spawn gh ENOENT' })
  })

  test('api with an etag sends If-None-Match and reads status + ETag', () => {
    const verb = api('repos/o/r/pulls', { etag: 'W/"abc"' })
    expect(verb.argv).toEqual(['api', '-i', '-H', 'If-None-Match: W/"abc"', 'repos/o/r/pulls'])
    const hit = verb.parse(ok('HTTP/2.0 200 OK\r\nEtag: W/"def"\r\n\r\n{"a":1}'))
    expect(hit).toMatchObject({ ok: true, status: 200, etag: 'W/"def"', body: { a: 1 } })
    const nm = verb.parse(ok('HTTP/2.0 304 Not Modified\nEtag: W/"abc"\n\n'))
    expect(nm).toMatchObject({ ok: true, status: 304, etag: 'W/"abc"', body: null })
    const junk = verb.parse(ok('HTTP/2.0 200 OK\n\nnot json'))
    expect(junk).toMatchObject({ ok: true, body: null, malformed: true })
    const bad = verb.parse({ exitCode: 1, stdout: 'HTTP/2.0 404 Not Found\n\n{}', stderr: 'nf' })
    expect(bad).toMatchObject({ ok: false, status: 404, body: null })
  })
})

describe('AsyncGh — stdin', () => {
  test('createReview forwards the verb input to the runner', async () => {
    const seen: { argv: string[]; input: string | undefined }[] = []
    const runner: AsyncCommandRunner = {
      async run(argv, opts) {
        seen.push({ argv: [...argv], input: opts?.input })
        return ok(JSON.stringify({ html_url: 'https://x/r/1' }))
      },
    }
    const url = await new AsyncGh('/repo', { runner }).createReview(7, {
      commitId: 'abc',
      body: 'b',
      comments: [{ path: 'a.ts', line: 3, body: 'c' }],
    })
    expect(url).toBe('https://x/r/1')
    expect(seen[0]!.argv.slice(-2)).toEqual(['--input', '-'])
    expect(JSON.parse(seen[0]!.input!)).toEqual({
      commit_id: 'abc',
      body: 'b',
      event: 'COMMENT',
      comments: [{ path: 'a.ts', line: 3, side: 'RIGHT', body: 'c' }],
    })
  })
})
