import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AttemptKey } from '../../src/ports.ts'
import {
  attemptFile,
  attemptsDir,
  fileAttemptStore,
  listAttempts,
} from '../../src/update/attempts.ts'

const KEY: AttemptKey = { repo: 'o/r', head: 'topic', headOid: 'h1', base: 'main', baseOid: 'b1' }

function spawnNode(script: string, ...args: string[]): Promise<number | null> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    child.on('error', reject)
    child.on('exit', resolveExit)
  })
}

describe('fileAttemptStore', () => {
  let root: string
  let file: string // the attempts directory

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pr-update-attempts-'))
    file = attemptsDir(root)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('a missing file reads as empty', () => {
    expect(fileAttemptStore(file).get(KEY)).toBeNull()
  })

  test('failures at the same key accumulate', () => {
    const store = fileAttemptStore(file)
    store.recordFailure(KEY, 'first')
    store.recordFailure(KEY, 'second')
    expect(store.get(KEY)).toMatchObject({ failures: 2, reason: 'second' })
  })

  test('a different head or base sha does not match', () => {
    const store = fileAttemptStore(file)
    store.recordFailure(KEY, 'boom')
    expect(store.get({ ...KEY, headOid: 'h2' })).toBeNull()
    expect(store.get({ ...KEY, baseOid: 'b2' })).toBeNull()
  })

  test('a failure at new shas replaces the old entry for that branch pair', () => {
    const store = fileAttemptStore(file)
    store.recordFailure(KEY, 'old')
    store.recordFailure({ ...KEY, headOid: 'h2' }, 'new')
    expect(store.get(KEY)).toBeNull()
    expect(store.get({ ...KEY, headOid: 'h2' })).toMatchObject({ failures: 1 })
  })

  test('clear removes the record for the PR target and leaves others', () => {
    const store = fileAttemptStore(file)
    const other = { ...KEY, head: 'other' }
    const release = { ...KEY, base: 'release' }
    store.recordFailure(KEY, 'a')
    store.recordFailure(release, 'b')
    store.recordFailure(other, 'c')
    store.clear('o/r', 'topic', 'main')
    expect(store.get(KEY)).toBeNull()
    expect(store.get(release)).toMatchObject({ failures: 1 })
    expect(store.get(other)).toMatchObject({ failures: 1 })
  })

  test('junk entries in a file are ignored', () => {
    const store = fileAttemptStore(file)
    store.recordFailure(KEY, 'seed')
    writeFileSync(
      attemptFile(file, KEY.repo, KEY.head, KEY.base),
      JSON.stringify({ entries: [null, 3, 'x', { repo: 'o/r' }] }),
    )
    expect(store.get(KEY)).toBeNull()
    expect(listAttempts(file)).toEqual([])
    store.recordFailure(KEY, 'boom')
    expect(store.get(KEY)).toMatchObject({ failures: 1 })
  })

  test('clear with nothing to remove does not create anything', () => {
    fileAttemptStore(file).clear('o/r', 'topic', 'main')
    expect(existsSync(file)).toBe(false)
  })

  test('entries older than 30 days are dropped on write', () => {
    let now = new Date('2026-01-01T00:00:00Z')
    const store = fileAttemptStore(file, { now: () => now })
    store.recordFailure(KEY, 'old')
    now = new Date('2026-02-15T00:00:00Z')
    store.recordFailure({ ...KEY, headOid: 'h2' }, 'new')
    expect(store.get(KEY)).toBeNull()
    expect(store.get({ ...KEY, headOid: 'h2' })).toMatchObject({ failures: 1 })
  })

  test('the write leaves no temp file and the file parses', () => {
    fileAttemptStore(file).recordFailure(KEY, 'boom')
    expect(readdirSync(file)).toEqual([
      attemptFile(file, KEY.repo, KEY.head, KEY.base).split('/').pop()!,
    ])
    expect(listAttempts(file)).toHaveLength(1)
  })

  test('an unreadable file reads as empty and is replaced on the next write', () => {
    fileAttemptStore(file).recordFailure(KEY, 'seed')
    writeFileSync(attemptFile(file, KEY.repo, KEY.head, KEY.base), 'not json')
    const store = fileAttemptStore(file)
    expect(store.get(KEY)).toBeNull()
    store.recordFailure(KEY, 'boom')
    expect(store.get(KEY)).toMatchObject({ failures: 1 })
  })
})

describe('fileAttemptStore: one file per branch', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pr-update-attempts-many-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('branches that sanitise alike do not share a file', () => {
    const dir = attemptsDir(root)
    expect(attemptFile(dir, 'o/r', 'a/b', 'main')).not.toBe(attemptFile(dir, 'o/r', 'a_b', 'main'))
    expect(attemptFile(dir, 'o/r', 'a', 'main')).not.toBe(attemptFile(dir, 'o/r', 'a', 'release'))
  })

  test('the earlier single attempts.json is not read', () => {
    writeFileSync(
      join(root, 'attempts.json'),
      JSON.stringify({
        entries: [{ ...KEY, failures: 9, reason: 'x', at: new Date().toISOString() }],
      }),
    )
    expect(fileAttemptStore(attemptsDir(root)).get(KEY)).toBeNull()
  })

  test('processes recording different PRs at once lose nothing', async () => {
    const dir = attemptsDir(root)
    const src = join(import.meta.dirname, '../../src/update/attempts.ts')
    const script = `import { fileAttemptStore } from ${JSON.stringify(src)}
const [dir, head] = process.argv.slice(2)
const store = fileAttemptStore(dir)
for (let i = 0; i < 5; i++) {
  store.recordFailure({ repo: 'o/r', head, headOid: 'h', base: 'main', baseOid: 'b' }, 'x')
}`
    const scriptFile = join(root, 'writer.ts')
    writeFileSync(scriptFile, script)
    const heads = Array.from({ length: 8 }, (_, i) => `topic-${i}`)
    const procs = heads.map((h) => spawnNode(scriptFile, dir, h))
    for (const p of procs) expect(await p).toBe(0)
    const store = fileAttemptStore(dir)
    for (const h of heads) {
      expect(
        store.get({ repo: 'o/r', head: h, headOid: 'h', base: 'main', baseOid: 'b' }),
      ).toMatchObject({ failures: 5 })
    }
    expect(listAttempts(dir)).toHaveLength(8)
  })
})
