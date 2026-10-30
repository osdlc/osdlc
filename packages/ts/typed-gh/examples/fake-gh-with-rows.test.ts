/**
 * Fake gh in a test with `@osdlc/typed-gh/testing`. Each builder returns a row
 * the real parser accepts, so a row is never dropped for a missing field.
 */

import { expect, test } from 'vitest'

import { Gh, type CommandRunner } from '@osdlc/typed-gh'
import { ghResult, prRow, repoRow } from '@osdlc/typed-gh/testing'

test('answer gh with built rows', () => {
  const runner: CommandRunner = {
    run: (argv) =>
      argv[0] === 'repo'
        ? ghResult([repoRow({ nameWithOwner: 'acme/widgets' })])
        : ghResult([prRow({ number: 7, headRefName: 'task/foo' }), prRow({ number: 8 })]),
  }
  const gh = new Gh('/repo', { runner })

  expect(gh.openPrFor('task/foo')?.number).toBe(7)
  expect(gh.repoList('acme').rows.map((r) => r.name)).toEqual(['widgets'])
})
