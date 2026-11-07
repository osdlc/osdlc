// Shape the lease commit: a fixed date for stable shas, your own identity,
// another payload file name and extra files beside it.

import { makeGitFixture } from '@osdlc/typed-git/testing'
import { afterAll, expect, test } from 'vitest'

import {
  buildLeaseCommit,
  DEFAULT_IDENTITY,
  DEFAULT_PAYLOAD_FILE,
  DETERMINISTIC_EPOCH,
} from '@osdlc/ref-lease'

const repo = makeGitFixture()
afterAll(repo.cleanup)

test('the defaults', () => {
  expect(DEFAULT_PAYLOAD_FILE).toBe('lease.json')
  expect(DEFAULT_IDENTITY).toEqual({ name: 'ref-lease', email: 'ref-lease@local' })
})

test('a fixed date gives the same sha on every run and every host', () => {
  const opts = { cwd: repo.dir, commitDate: DETERMINISTIC_EPOCH }
  expect(buildLeaseCommit({ holder: 'a' }, opts)).toBe(buildLeaseCommit({ holder: 'a' }, opts))
})

test('your own identity, payload file and extra files', () => {
  const sha = buildLeaseCommit(
    { holder: 'a' },
    {
      cwd: repo.dir,
      identity: { name: 'deploy-bot', email: 'deploy-bot@example.com' },
      payloadFile: 'slot.json',
      files: { 'notes.md': 'Deploying 1.4.2\n' },
      message: 'claim deploy slot',
    },
  )
  expect(repo.git.lsTree(sha).map((e) => e.path)).toEqual(['notes.md', 'slot.json'])
  expect(repo.git.showAtRev(sha, 'slot.json')).toBe('{"holder":"a"}')
})
