/**
 * Turn what a person typed into one pull request. `parsePrRef` reads the text
 * and starts no process. `prFind` reads it and runs the lookup it needs.
 */

import { expect, test } from 'vitest'

import { Gh, parsePrRef, type CommandRunner, type PrRef } from '@osdlc/typed-gh'

test('read a number, a qualified number, a URL or a branch', () => {
  const ref: PrRef | null = parsePrRef('#42')

  expect(ref).toEqual({ kind: 'number', number: 42, repo: null, orBranch: null })
  expect(parsePrRef('acme/widgets#42')).toMatchObject({
    kind: 'number',
    repo: { owner: 'acme', repo: 'widgets' },
  })
  expect(parsePrRef('https://github.com/acme/widgets/pull/42')).toMatchObject({
    kind: 'url',
    number: 42,
  })
  expect(parsePrRef('feature/login')).toEqual({ kind: 'branch', name: 'feature/login' })
  expect(parsePrRef('not a branch')).toBeNull()
})

test('find the pull request for a branch, even after it merged', () => {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      const rows = [{ number: 9, state: 'MERGED', headRefName: 'feature/login' }]
      return { exitCode: 0, stdout: JSON.stringify(rows), stderr: '' }
    },
  }
  const gh = new Gh('/repo', { runner })

  const pr = gh.prFind('feature/login')

  expect(pr?.number).toBe(9)
  expect(pr?.state).toBe('MERGED')
  expect(calls[0]?.slice(0, 6)).toEqual(['pr', 'list', '--state', 'all', '--head', 'feature/login'])
})
