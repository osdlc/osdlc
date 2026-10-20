/**
 * A REST GET through `gh api`. It never throws: the result says whether it
 * worked. Pass an `etag` to make the request conditional.
 */

import { expect, test } from 'bun:test'

import { Gh, type ApiOptions, type ApiResponse, type CommandRunner } from '@osdlc/typed-gh'

/** A runner that records each call's argv and answers every call with `stdout`. */
function answering(stdout: string, exitCode = 0) {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return { exitCode, stdout, stderr: exitCode === 0 ? '' : 'gh: Not Found (HTTP 404)' }
    },
  }
  return { runner, calls }
}

test('read an endpoint; {owner} and {repo} are filled in by gh', () => {
  const { runner, calls } = answering('[{"id":1}]')

  const res: ApiResponse = new Gh('/repo', { runner }).api('repos/{owner}/{repo}/issues/7/comments')

  expect(calls[0]).toEqual(['api', 'repos/{owner}/{repo}/issues/7/comments'])
  expect(res).toMatchObject({ ok: true, status: 200, body: [{ id: 1 }] })
})

test('a failure is a value: ok is false and nothing throws', () => {
  const { runner } = answering('', 1)

  const res = new Gh('/repo', { runner }).api('repos/{owner}/{repo}/missing')

  expect(res).toMatchObject({ ok: false, body: null, stderr: 'gh: Not Found (HTTP 404)' })
})

test('a conditional request sends If-None-Match, and a 304 has no body', () => {
  const { runner, calls } = answering('HTTP/2.0 304 Not Modified\nEtag: W/"abc"\n\n')
  const options: ApiOptions = { etag: 'W/"abc"' }

  const res = new Gh('/repo', { runner }).api('repos/{owner}/{repo}/pulls', options)

  expect(calls[0]).toContain('If-None-Match: W/"abc"')
  expect(res).toMatchObject({ ok: true, status: 304, etag: 'W/"abc"', body: null })
})
