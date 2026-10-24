import { afterAll, describe, expect, test } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveTrustRoot, trustStore } from '@osdlc/trust-repo'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { runTrustCommand } from '../src/trust-command.ts'
import { fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(): Promise<string> {
  const dir = await fixtureRoot({})
  roots.push(dir)
  return dir
}

/**
 * The same store `runTrustCommand` builds — the literal tool name
 * `'waypost'`, shared with the waypost CLI; see `trust-command.ts`'s module
 * docblock.
 */
function trustStoreFor(env: Record<string, string | undefined>, home: string) {
  return trustStore({ tool: 'waypost', env, home })
}

/** Write a USER-layer trust.paths/trust.owners policy at `home`. */
async function writeUserTrustPolicy(
  home: string,
  trust: { paths?: string[]; owners?: string[] },
): Promise<void> {
  await mkdir(join(home, '.config', 'waypost'), { recursive: true })
  await writeFile(
    join(home, '.config', 'waypost', 'config.json'),
    JSON.stringify({ trust }),
    'utf-8',
  )
}

interface Run {
  code: number
  out: string
  err: string
  env: Record<string, string | undefined>
  home: string
}

/**
 * One invocation against a throwaway state home. Every test goes through this:
 * a test that let `env` or `home` default would read the developer's own trust
 * store, and one that wrote would grant trust on their machine.
 */
async function run(
  dir: string,
  argv: string[],
  store?: { env: Record<string, string | undefined>; home: string },
): Promise<Run> {
  const home = store?.home ?? (await root())
  const env = store?.env ?? { XDG_STATE_HOME: join(home, '.local', 'state') }
  let out = ''
  let err = ''
  const code = await runTrustCommand('waypost', dir, argv, {
    stdout: (t) => {
      out += t
    },
    stderr: (t) => {
      err += t
    },
    env,
    home,
  })
  return { code, out, err, env, home }
}

describe('way trust', () => {
  test('trusts the root and names the path it was keyed on', async () => {
    const dir = await root()
    const result = await run(dir, [])

    expect(result.code).toBe(0)
    expect(result.out).toBe(`trusted ${await resolveTrustRoot(dir)}\n`)
    expect(result.err).toBe('')
    expect(await trustStoreFor(result.env, result.home).list()).toEqual([
      await resolveTrustRoot(dir),
    ])
  })

  test('says so rather than implying a fresh grant when it was already trusted', async () => {
    const dir = await root()
    const first = await run(dir, [])
    const second = await run(dir, [], { env: first.env, home: first.home })

    expect(second.code).toBe(0)
    expect(second.out).toBe(`already trusted ${await resolveTrustRoot(dir)}\n`)
  })
})

describe('way trust --untrust', () => {
  test('removes a trust grant', async () => {
    const dir = await root()
    const granted = await run(dir, [])
    const result = await run(dir, ['--untrust'], { env: granted.env, home: granted.home })

    expect(result.code).toBe(0)
    expect(result.out).toBe(`untrusted ${await resolveTrustRoot(dir)}\n`)
    expect(await trustStoreFor(result.env, result.home).list()).toEqual([])
  })

  test('exits 1 when the root was never trusted', async () => {
    // A well-formed command that failed against the state it found — the house
    // rule's 1, not its 2. Reported rather than shrugged off: a silent success
    // reads as "it is no longer trusted", which is wrong if it never was.
    const dir = await root()
    const result = await run(dir, ['--untrust'])

    expect(result.code).toBe(1)
    expect(result.out).toBe('')
    expect(result.err).toBe(`waypost: not trusted: ${await resolveTrustRoot(dir)}\n`)
  })

  test('a policy that still covers the root notes so, even though the marker is gone', async () => {
    // Mirrors `sdlc repo untrust`: removing the marker does not change the
    // answer when a policy rule covers the root regardless.
    const dir = await root()
    const home = await root()
    await writeUserTrustPolicy(home, { paths: [`${dir}/**`, dir] })
    const env = { XDG_STATE_HOME: join(home, '.local', 'state') }
    const granted = await run(dir, [], { env, home })

    const result = await run(dir, ['--untrust'], { env: granted.env, home: granted.home })
    expect(result.code).toBe(0)
    expect(result.out).toBe(`untrusted ${await resolveTrustRoot(dir)}\n`)
    expect(result.err).toContain('is still trusted by')
    expect(result.err).toContain('trust.paths')
    // The marker really is gone — only the policy still trusts it.
    expect(await trustStoreFor(env, home).list()).toEqual([])
  })
})

describe('way trust with a trust.owners policy', () => {
  async function ownedRepo(): Promise<{ dir: string; home: string; env: Record<string, string> }> {
    const base = await root()
    const repo = makeGitFixture({ dir: join(base, 'repo') })
    repo.git.remoteAdd('origin', 'https://github.com/AcmeOwner/dev.git')
    const home = await root()
    await writeUserTrustPolicy(home, { owners: ['acmeowner'] })
    return { dir: repo.dir, home, env: { XDG_STATE_HOME: join(home, '.local', 'state') } }
  }

  test('--untrust notes that the owner policy still trusts the root', async () => {
    const { dir, home, env } = await ownedRepo()
    await run(dir, [], { env, home })

    const result = await run(dir, ['--untrust'], { env, home })
    expect(result.code).toBe(0)
    expect(result.err).toContain('is still trusted by')
    expect(result.err).toContain('trust.owners')
    expect(await trustStoreFor(env, home).list()).toEqual([])
  })
})

describe('way trust --show', () => {
  test('reports either answer on stdout and exits 0', async () => {
    // "not trusted" is the fact this command was asked for, not a failure to
    // report it, so a script can read the line without branching on the code.
    const dir = await root()
    const before = await run(dir, ['--show'])
    expect(before.code).toBe(0)
    expect(before.out).toBe(`not trusted ${await resolveTrustRoot(dir)}\n`)

    await trustStoreFor(before.env, before.home).trust(dir)
    const after = await run(dir, ['--show'], { env: before.env, home: before.home })
    expect(after.code).toBe(0)
    expect(after.out).toBe(`trusted ${await resolveTrustRoot(dir)}\n`)
  })

  test('a marker wins over a matching policy — by reports "marker", not "path"', async () => {
    // Precedence: marker, then trust.paths, then trust.owners.
    const dir = await root()
    const home = await root()
    await writeUserTrustPolicy(home, { paths: [`${dir}/**`, dir] })
    const env = { XDG_STATE_HOME: join(home, '.local', 'state') }

    // The policy alone already covers it — proven independently above — so a
    // granted marker must still take precedence in what `by` reports.
    const beforeMarker = await run(dir, ['--show', '--json'], { env, home })
    expect(JSON.parse(beforeMarker.out)).toMatchObject({ trusted: true, by: 'path' })

    await trustStoreFor(env, home).trust(dir)
    const afterMarker = await run(dir, ['--show', '--json'], { env, home })
    expect(JSON.parse(afterMarker.out)).toEqual({
      root: await resolveTrustRoot(dir),
      trusted: true,
      changed: false,
      by: 'marker',
    })
  })

  test('a trust.owners policy covers a root by its origin owner', async () => {
    const dir = await root()
    const repo = makeGitFixture({ dir: join(dir, 'repo') })
    repo.git.remoteAdd('origin', 'https://github.com/AcmeOwner/dev.git')
    const home = await root()
    await writeUserTrustPolicy(home, { owners: ['acmeowner'] })
    const env = { XDG_STATE_HOME: join(home, '.local', 'state') }

    const result = await run(repo.dir, ['--show', '--json'], { env, home })
    expect(JSON.parse(result.out)).toMatchObject({ trusted: true, by: 'owner', rule: 'acmeowner' })
  })

  test('a project config that will not parse fails the command, not silently', async () => {
    const dir = await root()
    await writeFile(join(dir, 'waypost.config.json'), '{ not json', 'utf-8')
    const result = await run(dir, ['--show'])
    expect(result.code).toBe(1)
    expect(result.err).toContain('invalid JSON')
    // The plain grant reads the same policy, so it fails the same way rather
    // than writing a marker under a config it could not read.
    const grant = await run(dir, [])
    expect(grant.code).toBe(1)
    expect(grant.err).toContain('invalid JSON')
  })
})

describe('way trust --list', () => {
  test('prints every trusted path, one per line', async () => {
    const a = await root()
    const b = await root()
    const first = await run(a, [])
    await run(b, [], { env: first.env, home: first.home })

    const result = await run(a, ['--list'], { env: first.env, home: first.home })
    expect(result.code).toBe(0)
    expect(result.out.trimEnd().split('\n')).toEqual(
      [await resolveTrustRoot(a), await resolveTrustRoot(b)].sort(),
    )
  })

  test('prints nothing when nothing is trusted', async () => {
    const result = await run(await root(), ['--list'])
    expect(result.code).toBe(0)
    expect(result.out).toBe('')
  })

  test('needs no config, so a broken project file does not break it', async () => {
    const dir = await root()
    await writeFile(join(dir, 'waypost.config.json'), '{ not json', 'utf-8')
    const result = await run(dir, ['--list'])
    expect(result.code).toBe(0)
  })
})

describe('way trust usage errors', () => {
  test('--help goes to stdout with exit 0', async () => {
    const result = await run(await root(), ['--help'])
    expect(result.code).toBe(0)
    expect(result.out).toContain('usage: way trust')
    expect(result.err).toBe('')
  })

  test('refuses two mode flags rather than picking one', async () => {
    const result = await run(await root(), ['--show', '--list'])
    expect(result.code).toBe(2)
    expect(result.err).toContain('give at most one')
    expect(result.out).toBe('')
  })

  test('refuses an unknown option', async () => {
    const result = await run(await root(), ['--nope'])
    expect(result.code).toBe(2)
    expect(result.err).toContain('unknown option: --nope')
  })

  test('refuses a positional argument', async () => {
    // -C is stripped by the caller, so a bare path here is a user who expected
    // `trust <dir>` to work. Saying so beats trusting the current directory.
    const result = await run(await root(), ['/some/repo'])
    expect(result.code).toBe(2)
    expect(result.err).toContain('takes no arguments')
    expect(await trustStoreFor(result.env, result.home).list()).toEqual([])
  })
})

/**
 * The machine form.
 *
 * The command answers three different questions, and a caller that had to
 * branch on which flag it passed to know which JSON shape came back would be
 * doing the tool's job for it — so the three root-scoped modes share one shape
 * (now carrying `by`/`rule` too) and only `--list` differs.
 */
describe('way trust --json', () => {
  test('every root-scoped mode answers in the same shape, with by="marker" once granted', async () => {
    const dir = await root()
    const resolved = await resolveTrustRoot(dir)

    const granted = await run(dir, ['--json'])
    expect(granted.code).toBe(0)
    expect(JSON.parse(granted.out)).toEqual({
      root: resolved,
      trusted: true,
      changed: true,
      by: 'marker',
    })

    // Same store, so the grant is a no-op: still trusted, nothing changed.
    const again = await run(dir, ['--json'], { env: granted.env, home: granted.home })
    expect(JSON.parse(again.out)).toEqual({
      root: resolved,
      trusted: true,
      changed: false,
      by: 'marker',
    })

    const shown = await run(dir, ['--show', '--json'], { env: granted.env, home: granted.home })
    expect(JSON.parse(shown.out)).toEqual({
      root: resolved,
      trusted: true,
      changed: false,
      by: 'marker',
    })

    const removed = await run(dir, ['--untrust', '--json'], {
      env: granted.env,
      home: granted.home,
    })
    expect(removed.code).toBe(0)
    expect(JSON.parse(removed.out)).toEqual({
      root: resolved,
      trusted: false,
      changed: true,
      by: null,
    })
  })

  test('--show reports an untrusted root as a fact, not a failure, with by: null', async () => {
    const dir = await root()
    const shown = await run(dir, ['--show', '--json'])
    expect(shown.code).toBe(0)
    expect(JSON.parse(shown.out)).toMatchObject({ trusted: false, changed: false, by: null })
    expect(shown.err).toBe('')
  })

  test('a policy hit reports by/rule with no marker at all', async () => {
    const dir = await root()
    const home = await root()
    await writeUserTrustPolicy(home, { paths: [`${dir}/**`, dir] })
    const env = { XDG_STATE_HOME: join(home, '.local', 'state') }

    const shown = await run(dir, ['--show', '--json'], { env, home })
    expect(shown.code).toBe(0)
    expect(JSON.parse(shown.out)).toEqual({
      root: await resolveTrustRoot(dir),
      trusted: true,
      changed: false,
      by: 'path',
      rule: dir,
    })
    // Genuinely policy-only.
    expect(await trustStoreFor(env, home).list()).toEqual([])
  })

  test('a failed --untrust still answers on stdout, and fails through the exit code', async () => {
    // A parser that got exit 1 and an empty stdout would have to guess what the
    // store held. The document says; the exit code and stderr say it failed.
    const dir = await root()
    const missed = await run(dir, ['--untrust', '--json'])
    expect(missed.code).toBe(1)
    expect(JSON.parse(missed.out)).toMatchObject({ trusted: false, changed: false, by: null })
    expect(missed.err).toContain('not trusted')
  })

  test('--list is the one different shape, because it answers a different question', async () => {
    const dir = await root()
    const granted = await run(dir, [])
    const listed = await run(dir, ['--list', '--json'], {
      env: granted.env,
      home: granted.home,
    })

    expect(listed.code).toBe(0)
    expect(JSON.parse(listed.out)).toEqual({
      trusted: await trustStoreFor(granted.env, granted.home).list(),
    })
  })

  test('nothing trusted is an empty array rather than no output', async () => {
    // The line form prints nothing, which is right for a pipe and useless to a
    // parser: `{"trusted":[]}` is the answer.
    const listed = await run(await root(), ['--list', '--json'])
    expect(JSON.parse(listed.out)).toEqual({ trusted: [] })
  })

  test('combines with each mode rather than contradicting them', async () => {
    // --json is not a fourth mode: pairing it with one must not trip the
    // two-modes-given guard.
    const dir = await root()
    expect((await run(dir, ['--show', '--json'])).code).toBe(0)
    expect((await run(dir, ['--list', '--json'])).code).toBe(0)
  })
})
