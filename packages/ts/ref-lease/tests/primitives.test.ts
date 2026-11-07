/**
 * The five operations against a real bare authority on disk. Network-free.
 */

import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { managedProcessRunner } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  buildLeaseCommit,
  casCreate,
  casDelete,
  casReplace,
  CasFailed,
  fetchNamespace,
  fetchRef,
  GitFailed,
  PayloadUnreadable,
  RefLeaseError,
  RefNotFound,
  type MirrorSkip,
} from '@osdlc/ref-lease'

import { makePair, REF, samplePayload, thrownBy, type Pair } from './_fixture.ts'

let env: Pair

beforeEach(() => {
  env = makePair()
})

afterEach(() => {
  env.cleanup()
})

const at = (cwd: string) => ({ cwd })
const authoritySha = (ref: string) => env.authorityGit.resolveRef(ref)
const localSha = (ref: string) => env.workerGit.resolveRef(ref)
const commit = (over: Record<string, unknown> = {}, parentSha?: string) =>
  buildLeaseCommit(samplePayload(over), { cwd: env.worker, parentSha: parentSha ?? null })

/**
 * Hold `<ref>.lock` in `repo` for ~200ms from another process, as a concurrent
 * fetch would: well inside the fetch's retry budget (25+50+75+100+125ms of
 * backoff), so a fast machine cannot run out of attempts before it is freed.
 */
async function holdRefLock(repo: string, ref: string): Promise<{ release: () => void }> {
  const lock = join(repo, '.git', `${ref}.lock`)
  mkdirSync(dirname(lock), { recursive: true })
  const proc = managedProcessRunner('sh').run(
    ['-c', `touch '${lock}'; sleep 0.2; rm -f '${lock}'`],
    { cwd: repo },
  )
  const until = Date.now() + 2000
  while (!existsSync(lock) && Date.now() < until) await new Promise((r) => setTimeout(r, 5))
  return {
    release: () => {
      proc.kill()
      rmSync(lock, { force: true })
    },
  }
}

function installAuthorityHook(name: string, body: string): void {
  const hook = join(env.authority, 'hooks', name)
  mkdirSync(dirname(hook), { recursive: true })
  writeFileSync(hook, `#!/bin/sh\n${body}\n`)
  chmodSync(hook, 0o755)
}

describe('compare-and-swap writes', () => {
  test('casCreate writes a new ref', () => {
    const sha = commit()
    casCreate(env.authority, REF, sha, at(env.worker))
    expect(authoritySha(REF)).toBe(sha)
  })

  test('casReplace moves a ref from the expected sha', () => {
    const first = commit()
    casCreate(env.authority, REF, first, at(env.worker))
    const second = commit({ state: 'renewed' }, first)
    casReplace(env.authority, REF, first, second, at(env.worker))
    expect(authoritySha(REF)).toBe(second)
  })

  test('casDelete removes a ref at the expected sha', () => {
    const sha = commit()
    casCreate(env.authority, REF, sha, at(env.worker))
    casDelete(env.authority, REF, sha, at(env.worker))
    expect(authoritySha(REF)).toBeNull()
  })

  test('an authority given as a remote name works like a path', () => {
    const sha = commit()
    casCreate('authority', REF, sha, at(env.worker))
    expect(authoritySha(REF)).toBe(sha)
  })

  test('a caller-supplied git client is used in place of cwd', () => {
    const sha = commit()
    casCreate(env.authority, REF, sha, { git: new Git(env.worker), cwd: '/nonexistent' })
    expect(authoritySha(REF)).toBe(sha)
  })

  test('each write keeps the local mirror current without a fetch', () => {
    const first = commit()
    casCreate(env.authority, REF, first, at(env.worker))
    expect(localSha(REF)).toBe(first)
    const second = commit({ state: 'renewed' }, first)
    casReplace(env.authority, REF, first, second, at(env.worker))
    expect(localSha(REF)).toBe(second)
    casDelete(env.authority, REF, second, at(env.worker))
    expect(localSha(REF)).toBeNull()
  })

  test('a stalled writer leaves a mirror another process moved, and reports the skip', () => {
    const sha0 = commit()
    casCreate(env.authority, REF, sha0, at(env.worker))
    const sha1 = commit({ state: 'a' }, sha0)
    const sha2 = commit({ state: 'b' }, sha1)
    // Another process sharing the ref store already moved the mirror to sha2.
    env.workerGit.rawChecked(['update-ref', REF, sha2])
    const skips: MirrorSkip[] = []
    casReplace(env.authority, REF, sha0, sha1, {
      cwd: env.worker,
      onMirrorSkip: (s) => skips.push(s),
    })
    expect(authoritySha(REF)).toBe(sha1)
    expect(localSha(REF)).toBe(sha2)
    expect(skips).toEqual([{ ref: REF, expectedSha: sha0, newSha: sha1 }])
  })

  test('a stalled delete leaves a mirror that a new claim already wrote', () => {
    const sha0 = commit()
    casCreate(env.authority, REF, sha0, at(env.worker))
    const reclaim = commit({ holder: 'worker-b' })
    env.workerGit.rawChecked(['update-ref', REF, reclaim])
    casDelete(env.authority, REF, sha0, at(env.worker))
    expect(localSha(REF)).toBe(reclaim)
  })
})

describe('lost races raise CasFailed', () => {
  test('a create of a ref that exists at the same sha', () => {
    const sha = commit()
    casCreate(env.authority, REF, sha, at(env.worker))
    const e = thrownBy(() => casCreate(env.authority, REF, sha, at(env.worker)))
    expect(e).toBeInstanceOf(CasFailed)
    expect((e as CasFailed).actualSha).toBe(sha)
  })

  test('a create of a ref that exists at another sha', () => {
    const first = commit()
    casCreate(env.authority, REF, first, at(env.worker))
    expect(() =>
      casCreate(env.authority, REF, commit({ state: 'x' }, first), at(env.worker)),
    ).toThrow(CasFailed)
  })

  test('a replace from the wrong sha', () => {
    const first = commit()
    casCreate(env.authority, REF, first, at(env.worker))
    const e = thrownBy(() =>
      casReplace(env.authority, REF, 'f'.repeat(40), commit({ s: 1 }, first), at(env.worker)),
    )
    expect(e).toBeInstanceOf(CasFailed)
    expect((e as CasFailed).expectedSha).toBe('f'.repeat(40))
    expect((e as Error).message).toContain('stale info')
  })

  test('a replace from the wrong sha to the sha the ref already holds', () => {
    // git answers "up to date" before it checks the lease, so this must not pass as a success.
    const first = commit()
    casCreate(env.authority, REF, first, at(env.worker))
    const second = commit({ s: 1 }, first)
    casReplace(env.authority, REF, first, second, at(env.worker))
    const e = thrownBy(() => casReplace(env.authority, REF, 'f'.repeat(40), second, at(env.worker)))
    expect(e).toBeInstanceOf(CasFailed)
    expect((e as CasFailed).actualSha).toBe(second)
  })

  test('a replace that keeps the sha it expected succeeds', () => {
    const first = commit()
    casCreate(env.authority, REF, first, at(env.worker))
    expect(() => casReplace(env.authority, REF, first, first, at(env.worker))).not.toThrow()
  })

  test('a delete from the wrong sha', () => {
    casCreate(env.authority, REF, commit(), at(env.worker))
    expect(() => casDelete(env.authority, REF, '0'.repeat(40), at(env.worker))).toThrow(CasFailed)
  })

  test('a replace of a ref that is gone', () => {
    const first = commit()
    expect(() =>
      casReplace(env.authority, REF, first, commit({ s: 1 }, first), at(env.worker)),
    ).toThrow(CasFailed)
  })

  test('a race lost at the authority after the client-side check passed', () => {
    const first = commit()
    casCreate(env.authority, REF, first, at(env.worker))
    const next = commit({ s: 'mine' }, first)
    const other = commit({ s: 'theirs' }, first)
    env.workerGit.rawChecked(['push', env.authority, `${other}:refs/scratch/other`])
    const marker = join(env.root, 'hook-entered')
    installAuthorityHook('pre-receive', `touch '${marker}'\nsleep 2`)
    const mover = managedProcessRunner('sh').run(
      [
        '-c',
        `while [ ! -e '${marker}' ]; do sleep 0.05; done; git -C '${env.authority}' update-ref '${REF}' ${other}`,
      ],
      { cwd: env.root },
    )
    let e: unknown
    try {
      e = thrownBy(() => casReplace(env.authority, REF, first, next, at(env.worker)))
    } finally {
      mover.kill()
    }
    expect(e).toBeInstanceOf(CasFailed)
    expect((e as Error).message).toContain('but expected')
  })
})

describe('other git failures raise GitFailed, never CasFailed', () => {
  function expectGitFailed(fn: () => unknown, contains?: RegExp): GitFailed {
    const e = thrownBy(fn)
    expect(e).toBeInstanceOf(GitFailed)
    expect(e).not.toBeInstanceOf(CasFailed)
    if (contains) expect((e as Error).message).toMatch(contains)
    return e as GitFailed
  }

  test('an authority that does not exist', () => {
    const e = expectGitFailed(() =>
      casCreate(join(env.root, 'nowhere'), REF, commit(), at(env.worker)),
    )
    expect(e.op).toBe('CAS-CREATE')
    expect(e.exitCode).not.toBe(0)
  })

  test('a malformed URL', () => {
    expectGitFailed(
      () => casCreate('https://bad host.invalid/x.git', REF, commit(), at(env.worker)),
      /URL rejected/,
    )
  })

  test('a pre-receive hook decline', () => {
    installAuthorityHook('pre-receive', 'echo "policy says no" >&2\nexit 1')
    expectGitFailed(
      () => casCreate(env.authority, REF, commit(), at(env.worker)),
      /pre-receive hook declined/,
    )
  })

  test('a local pre-push hook decline', () => {
    const hook = join(env.worker, '.git', 'hooks', 'pre-push')
    mkdirSync(dirname(hook), { recursive: true })
    writeFileSync(hook, '#!/bin/sh\necho "blocked" >&2\nexit 1\n')
    chmodSync(hook, 0o755)
    expectGitFailed(() => casCreate(env.authority, REF, commit(), at(env.worker)))
  })

  test('a directory/file ref clash at the authority', () => {
    const sha = commit()
    env.workerGit.rawChecked(['push', env.authority, `${sha}:${REF}/child`])
    expectGitFailed(
      () => casCreate(env.authority, REF, sha, at(env.worker)),
      /failed to update ref|refname conflict/,
    )
  })

  test('a fetch from an authority that does not exist', () => {
    const e = expectGitFailed(() => fetchRef(join(env.root, 'nowhere'), REF, at(env.worker)))
    expect(e.op).toBe('FETCH-REF')
    expect(() => fetchNamespace(join(env.root, 'nowhere'), 'refs/locks', at(env.worker))).toThrow(
      GitFailed,
    )
  })
})

describe('fetchRef', () => {
  test('returns the sha and the parsed payload, in a fresh reader', () => {
    const sha = commit()
    casCreate(env.authority, REF, sha, at(env.worker))
    const got = fetchRef(env.authority, REF, at(env.reader('reader')))
    expect(got).toEqual({ sha, payload: samplePayload() })
  })

  test('runs decode over the parsed payload', () => {
    casCreate(env.authority, REF, commit(), at(env.worker))
    const got = fetchRef(env.authority, REF, {
      cwd: env.worker,
      decode: (v) => (v as { holder: string }).holder.toUpperCase(),
    })
    expect(got.payload).toBe('WORKER-A')
  })

  test("propagates decode's own error unchanged", () => {
    casCreate(env.authority, REF, commit(), at(env.worker))
    const boom = new Error('bad payload')
    expect(
      thrownBy(() =>
        fetchRef(env.authority, REF, {
          cwd: env.worker,
          decode: () => {
            throw boom
          },
        }),
      ),
    ).toBe(boom)
  })

  test('reads a payload file of another name', () => {
    const sha = buildLeaseCommit({ a: 1 }, { cwd: env.worker, payloadFile: 'state.json' })
    casCreate(env.authority, REF, sha, at(env.worker))
    expect(
      fetchRef(env.authority, REF, { cwd: env.worker, payloadFile: 'state.json' }).payload,
    ).toEqual({
      a: 1,
    })
  })

  test('raises RefNotFound for a missing ref', () => {
    const e = thrownBy(() => fetchRef(env.authority, REF, at(env.worker)))
    expect(e).toBeInstanceOf(RefNotFound)
    expect((e as RefNotFound).ref).toBe(REF)
  })

  test('raises PayloadUnreadable when the commit has no payload file', () => {
    const sha = buildLeaseCommit({ a: 1 }, { cwd: env.worker, payloadFile: 'other.json' })
    casCreate(env.authority, REF, sha, at(env.worker))
    const e = thrownBy(() => fetchRef(env.authority, REF, at(env.worker)))
    expect(e).toBeInstanceOf(PayloadUnreadable)
    expect((e as PayloadUnreadable).sha).toBe(sha)
  })

  test('raises PayloadUnreadable when the payload is not JSON', () => {
    const blob = env.workerGit
      .rawChecked(['hash-object', '-w', '--stdin'], { input: '{nope' })
      .stdout.trim()
    const tree = env.workerGit
      .rawChecked(['mktree'], { input: `100644 blob ${blob}\tlease.json\n` })
      .stdout.trim()
    const sha = env.workerGit.rawChecked(['commit-tree', tree, '-m', 'x']).stdout.trim()
    casCreate(env.authority, REF, sha, at(env.worker))
    const e = thrownBy(() => fetchRef(env.authority, REF, at(env.worker)))
    expect(e).toBeInstanceOf(PayloadUnreadable)
    expect((e as Error).cause).toBeInstanceOf(SyntaxError)
  })

  test('retries while another process holds the local ref lock', async () => {
    const sha = commit()
    casCreate(env.authority, REF, sha, at(env.worker))
    const reader = env.reader('locked')
    const held = await holdRefLock(reader, REF)
    try {
      expect(fetchRef(env.authority, REF, at(reader)).sha).toBe(sha)
    } finally {
      held.release()
    }
  })
})

describe('fetchNamespace', () => {
  test('lists every ref under the prefix', () => {
    const a = commit()
    const b = commit({ holder: 'b' })
    casCreate(env.authority, REF, a, at(env.worker))
    casCreate(env.authority, 'refs/locks/other', b, at(env.worker))
    casCreate(env.authority, 'refs/elsewhere/x', b, at(env.worker))
    expect(fetchNamespace(env.authority, 'refs/locks', at(env.reader('r')))).toEqual({
      [REF]: a,
      'refs/locks/other': b,
    })
  })

  test('ignores a trailing slash on the prefix', () => {
    const a = commit()
    casCreate(env.authority, REF, a, at(env.worker))
    expect(fetchNamespace(env.authority, 'refs/locks/', at(env.worker))).toEqual({ [REF]: a })
  })

  test('an empty prefix is an empty success', () => {
    expect(fetchNamespace(env.authority, 'refs/locks', at(env.worker))).toEqual({})
  })

  test('prunes local refs the authority deleted', () => {
    const a = commit()
    casCreate(env.authority, REF, a, at(env.worker))
    const reader = env.reader('r')
    fetchNamespace(env.authority, 'refs/locks', at(reader))
    env.authorityGit.rawChecked(['update-ref', '-d', REF])
    expect(fetchNamespace(env.authority, 'refs/locks', at(reader))).toEqual({})
  })

  test('retries while another process holds a local ref lock', async () => {
    const sha = commit()
    casCreate(env.authority, REF, sha, at(env.worker))
    const reader = env.reader('locked-ns')
    const held = await holdRefLock(reader, REF)
    try {
      expect(fetchNamespace(env.authority, 'refs/locks', at(reader))[REF]).toBe(sha)
    } finally {
      held.release()
    }
  })
})

test('every error the operations throw is a RefLeaseError', () => {
  expect(thrownBy(() => fetchRef(env.authority, REF, at(env.worker)))).toBeInstanceOf(RefLeaseError)
})
