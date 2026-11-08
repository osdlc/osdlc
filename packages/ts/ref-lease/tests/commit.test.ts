import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  buildLeaseCommit,
  canonicalJson,
  DEFAULT_IDENTITY,
  DETERMINISTIC_EPOCH,
} from '@osdlc/ref-lease'

import { makePair, samplePayload, type Pair } from './_fixture.ts'

let env: Pair
beforeEach(() => {
  env = makePair()
})
afterEach(() => {
  env.cleanup()
})

const paths = (sha: string) => env.workerGit.lsTree(sha).map((e) => e.path)
const show = (sha: string, path: string) => env.workerGit.showAtRev(sha, path)
const field = (sha: string, format: string) =>
  env.workerGit.rawChecked(['show', '-s', `--format=${format}`, sha]).stdout.trim()

describe('tree', () => {
  test('holds only the payload file by default, as canonical JSON', () => {
    const payload = { b: 1, a: [2, { d: 3, c: 4 }] }
    const sha = buildLeaseCommit(payload, { cwd: env.worker })
    expect(paths(sha)).toEqual(['lease.json'])
    expect(show(sha, 'lease.json')).toBe(canonicalJson(payload))
  })

  test('holds extra files byte for byte, and a renamed payload file', () => {
    const sha = buildLeaseCommit(samplePayload(), {
      cwd: env.worker,
      payloadFile: 'state.json',
      files: { 'handoff.md': '# Handoff\n\nDone.\n', 'z.txt': '' },
    })
    expect(paths(sha).sort()).toEqual(['handoff.md', 'state.json', 'z.txt'])
    expect(show(sha, 'handoff.md')).toBe('# Handoff\n\nDone.\n')
  })

  test.each(['a/b', '', '.', '..', 'tab\tname', 'line\nname', 'lease.json'])(
    'rejects the file name %j',
    (name) => {
      expect(() => buildLeaseCommit({}, { cwd: env.worker, files: { [name]: 'x' } })).toThrow(
        TypeError,
      )
    },
  )

  test('rejects a payload file name that is not one segment', () => {
    expect(() => buildLeaseCommit({}, { cwd: env.worker, payloadFile: 'a/b.json' })).toThrow(
      TypeError,
    )
  })

  test('rejects a payload canonicalJson cannot encode, before writing anything', () => {
    expect(() => buildLeaseCommit({ a: undefined }, { cwd: env.worker })).toThrow(TypeError)
  })
})

test('touches no index, work tree or branch', () => {
  const status = () => env.workerGit.rawChecked(['status', '--porcelain=v1']).stdout
  const head = env.workerGit.resolveRef('HEAD')
  const before = status()
  buildLeaseCommit(samplePayload(), { cwd: env.worker, files: { 'handoff.md': 'x' } })
  expect(env.workerGit.resolveRef('HEAD')).toBe(head)
  expect(status()).toBe(before)
})

describe('commit', () => {
  test('the default identity and message', () => {
    const sha = buildLeaseCommit({}, { cwd: env.worker })
    expect(field(sha, '%an <%ae>|%cn <%ce>|%s')).toBe(
      `${DEFAULT_IDENTITY.name} <${DEFAULT_IDENTITY.email}>|` +
        `${DEFAULT_IDENTITY.name} <${DEFAULT_IDENTITY.email}>|lease`,
    )
  })

  test('a caller identity and message', () => {
    const sha = buildLeaseCommit(
      {},
      { cwd: env.worker, identity: { name: 'locker', email: 'locker@x' }, message: 'claim' },
    )
    expect(field(sha, '%an <%ae>|%s')).toBe('locker <locker@x>|claim')
  })

  test('the same inputs at DETERMINISTIC_EPOCH give the same sha', () => {
    const opts = { cwd: env.worker, commitDate: DETERMINISTIC_EPOCH }
    expect(buildLeaseCommit(samplePayload(), opts)).toBe(buildLeaseCommit(samplePayload(), opts))
  })

  test('the default date is now, to the second, in UTC', () => {
    const before = Math.floor(Date.now() / 1000)
    const sha = buildLeaseCommit({}, { cwd: env.worker })
    const t = Number(field(sha, '%ct'))
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(Math.ceil(Date.now() / 1000))
    expect(field(sha, '%ad')).toMatch(/\+0000$/)
  })

  test('parents: none, one, then extra parents in order', () => {
    const a = buildLeaseCommit({ n: 1 }, { cwd: env.worker })
    const b = buildLeaseCommit({ n: 2 }, { cwd: env.worker, parentSha: a })
    const c = buildLeaseCommit({ n: 3 }, { cwd: env.worker })
    const d = buildLeaseCommit({ n: 4 }, { cwd: env.worker, parentSha: b, extraParentShas: [c] })
    expect(field(a, '%P')).toBe('')
    expect(field(b, '%P')).toBe(a)
    expect(field(d, '%P')).toBe(`${b} ${c}`)
  })
})
