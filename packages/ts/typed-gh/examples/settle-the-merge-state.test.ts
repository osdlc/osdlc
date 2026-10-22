/**
 * GitHub works out whether a pull request can merge when it is first asked,
 * and answers `UNKNOWN` until it has. `prViewSettled` asks again.
 */

import { expect, test } from 'vitest'

import { Gh, type CommandRunner, type MergeStateStatus } from '@osdlc/typed-gh'

/** A runner that gives each call the next canned body; the last body repeats. */
function replaying(bodies: object[]) {
  let asked = 0
  const runner: CommandRunner = {
    run() {
      const body = bodies[Math.min(asked, bodies.length - 1)]
      asked += 1
      return { exitCode: 0, stdout: JSON.stringify(body), stderr: '' }
    },
  }
  return { runner, asked: () => asked }
}

const computing = { number: 7, mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }
const settled = { number: 7, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' }

test('ask again while GitHub is still computing', () => {
  const { runner, asked } = replaying([computing, settled])
  const gh = new Gh('/repo', { runner })

  const pr = gh.prViewSettled(7, { attempts: 3, sleep: () => {} })

  const status: MergeStateStatus | undefined = pr?.mergeStateStatus
  expect(status).toBe('CLEAN')
  expect(asked()).toBe(2)
})

test('UNKNOWN can still be the final answer, so handle it', () => {
  const { runner, asked } = replaying([computing])
  const gh = new Gh('/repo', { runner })

  const pr = gh.prViewSettled(7, { attempts: 2, sleep: () => {} })

  expect(pr?.mergeable).toBe('UNKNOWN')
  expect(asked()).toBe(2)
})
