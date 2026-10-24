/**
 * The web view's mutating endpoint, over real HTTP.
 *
 * `POST /api/trust` is the only thing in this repository that grants standing
 * permission to run a repository's code from a request. The page hides its
 * button when a grant would not apply, and a hidden button is not a gate — two
 * defects shipped in exactly that space, one letting `--no-exec` be overridden
 * from the browser and one persisting the deliberately unpersisted `--exec`.
 *
 * Every case injects `env` and `home` at a temp directory. A test that granted
 * trust in the developer's own `~/.local/state/waypost/` would be a bug worse than
 * a failure, so one case also asserts the real store is untouched.
 *
 * The token is read out of the served page the way the page reads it, so the
 * injection path in `page.ts` is covered rather than assumed.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { ToolDef } from '@osdlc/system-model/detect'
import { resolveTrustRoot, trustStore, withheldHint } from '@osdlc/trust-repo'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { cacheDir } from '../src/cache.ts'
import { collectAndCache, makeProject } from '../src/catalog.ts'
import { groupOf } from '../src/groups.ts'
import { startServer, type ServeOptions } from '../src/serve.ts'

const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

async function temp(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

/**
 * The same store `serve()` builds — the literal tool name `'waypost'`, keyed
 * on an injected home so a test can never read or write the real one.
 */
function trustStoreFor(home: string) {
  return trustStore({ tool: 'waypost', env: {}, home })
}

/** A project with parse-only runners; the endpoint's behaviour is what is under test. */
async function project(): Promise<string> {
  const dir = await temp('waypost-serve-')
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
    'utf-8',
  )
  return dir
}

interface Started {
  address: string
  /** The one-shot token that signs a browser in; spent by `pageToken`. */
  bootToken: string
  /** Injected trust store home; `trustStoreFor(home).list()` reads it. */
  home: string
  root: string
  stop(): void
}

/**
 * Start a server in one of the three shapes the CLI can hand it.
 *
 *   "untrusted"  the gate came out `untrusted` — the only shape in which a
 *                grant applies, and the only one the page offers a button in
 *   "no-exec"    `--no-exec`, which must stay off however trusted the repo is
 *   "exec"       `--exec`, consent for one run that must record nothing
 */
async function start(
  shape: 'untrusted' | 'no-exec' | 'exec',
  // "stale" warms the store and then edits the file the probe read, so the
  // server's first request is answered from a cache it knows is out of date —
  // the real state a slow runner leaves behind on a boot, reached the real way
  // rather than by reaching into the server's internals.
  cache: 'cold' | 'stale' = 'cold',
  projectToolsPending = false,
): Promise<Started> {
  const root = await project()
  const home = await temp('waypost-serve-home-')
  const options: ServeOptions = {
    project: makeProject(),
    projectToolsPending,
    root,
    collectOptions: {
      allowExec: shape === 'exec',
      ...(shape === 'untrusted' ? { execWithheldHint: withheldHint('waypost') } : {}),
    },
    port: 0,
    open: false,
    env: {},
    home,
  }
  if (cache === 'stale') {
    await collectAndCache(options.project, root, options.collectOptions, cacheDir({}, home))
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'p', scripts: { build: 'echo b', ship: 'echo s' } }),
      'utf-8',
    )
  }
  const { server, bootToken } = await startServer(options)
  return {
    address: `http://127.0.0.1:${server.port}`,
    bootToken,
    home,
    root,
    stop: () => void server.stop(),
  }
}

/**
 * The session token, obtained the way the page itself obtains it: spend the
 * one-shot boot token on the page route, then read the token the server
 * embedded in the document. The boot token is burned by this call, which is
 * the real flow — a test that fetched the page unauthenticated would be
 * testing a route that no longer exists.
 */
async function pageToken(address: string, bootToken: string): Promise<string> {
  const html = await (await fetch(`${address}/?boot=${bootToken}`)).text()
  const match = /window\.__WAYPOST_TOKEN__ = "([^"]*)"/.exec(html)
  expect(match).not.toBeNull()
  return match![1]!
}

function post(address: string, token?: string): Promise<Response> {
  return fetch(`${address}/api/trust`, {
    method: 'POST',
    ...(token === undefined ? {} : { headers: { 'x-waypost-token': token } }),
  })
}

describe('POST /api/trust — method', () => {
  test('every other method is 405, including the GET a link or an <img> makes', async () => {
    const s = await start('untrusted')
    try {
      // DELETE is absent because it is now a real route — revoking. It is
      // still unreachable from a link or an <img>, which is what this test is
      // about; its own auth is covered below.
      for (const method of ['GET', 'HEAD', 'PUT', 'OPTIONS']) {
        const res = await fetch(`${s.address}/api/trust`, { method })
        expect(res.status).toBe(405)
      }
      expect(await trustStoreFor(s.home).list()).toEqual([])
    } finally {
      s.stop()
    }
  })
})

describe('POST /api/trust — token', () => {
  test('no token, an empty one, and a wrong one are all 401, and grant nothing', async () => {
    const s = await start('untrusted')
    try {
      const real = await pageToken(s.address, s.bootToken)
      const wrongSameLength = '0'.repeat(real.length)
      const wrongOtherLength = 'short'

      const bodies: string[] = []
      for (const token of [undefined, '', wrongSameLength, wrongOtherLength]) {
        const res = await post(s.address, token)
        expect(res.status).toBe(401)
        const body = await res.text()
        // Nothing of what was sent comes back, and the length does not vary:
        // a caller that guessed must learn nothing from the reply.
        expect(body).not.toContain(real)
        if (token !== undefined && token !== '') expect(body).not.toContain(token)
        bodies.push(body)
        expect(await trustStoreFor(s.home).list()).toEqual([])
      }
      expect(new Set(bodies).size).toBe(1)
    } finally {
      s.stop()
    }
  })

  test('the right token on an applicable root grants, and the store records it', async () => {
    const s = await start('untrusted')
    try {
      const res = await post(s.address, await pageToken(s.address, s.bootToken))
      expect(res.status).toBe(200)

      const body = (await res.json()) as { allowExec: boolean; trustable: boolean }
      expect(body.allowExec).toBe(true)
      // The grant applied, so the offer is withdrawn — the page must not go on
      // telling the user to do what they just did.
      expect(body.trustable).toBe(false)
      expect(await trustStoreFor(s.home).list()).toEqual([await resolveTrustRoot(s.root)])
    } finally {
      s.stop()
    }
  })
})

describe('POST /api/trust — applicability', () => {
  test('--no-exec refuses the grant, and the store stays empty', async () => {
    // The regression: the endpoint used to grant on method and token alone, so
    // a server started with --no-exec could be talked into running moon from
    // the browser. --no-exec is the last word however trusted the repo is.
    const s = await start('no-exec')
    try {
      const res = await post(s.address, await pageToken(s.address, s.bootToken))
      expect(res.status).toBe(409)
      expect(await trustStoreFor(s.home).list()).toEqual([])
    } finally {
      s.stop()
    }
  })

  test('--exec refuses the grant, so consent for one run is never persisted', async () => {
    // The regression: --exec records nothing everywhere else — the CLIs and the
    // TUI all honour that — and only this endpoint turned a deliberate single
    // run into a standing grant nobody remembers giving.
    const s = await start('exec')
    try {
      const res = await post(s.address, await pageToken(s.address, s.bootToken))
      expect(res.status).toBe(409)
      expect(await trustStoreFor(s.home).list()).toEqual([])
    } finally {
      s.stop()
    }
  })
})

/**
 * The cache the page is served from.
 *
 * `start()` injects `env: {}` and a temp `home`, so the store is
 * `<temp home>/.cache/waypost` — the real `~/.cache/waypost` is neither read nor
 * written by anything here, the same rule the trust cases follow.
 */
describe('GET /api/catalog — cache', () => {
  test('carries a cache array beside trustable, one entry per runner', async () => {
    const s = await start('untrusted')
    try {
      const token = await pageToken(s.address, s.bootToken)
      const res = await fetch(`${s.address}/api/catalog`, { headers: { 'x-waypost-token': token } })
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        cache: Array<{ runner: string; state: string; estimateMs: number | null; slow: boolean }>
        trustable: boolean
      }
      expect(Array.isArray(body.cache)).toBe(true)
      expect(body.cache.length).toBeGreaterThan(0)
      for (const row of body.cache) {
        expect(['fresh', 'stale', 'miss']).toContain(row.state)
        // Never invented: an unmeasured cost is null, not a plausible number.
        expect(row.estimateMs === null || typeof row.estimateMs === 'number').toBe(true)
        expect(typeof row.slow).toBe('boolean')
      }
    } finally {
      s.stop()
    }
  })
})

describe('POST /api/run — a row that is no longer there', () => {
  test("names the staleness rather than answering a bare 'not found'", async () => {
    // The dishonesty this prevents: a row is on screen, the user clicks it, and
    // the server says it does not exist with nothing connecting the two facts.
    // The listing came out of the store; saying so, with its age, is the
    // difference between a dead end and something the user can act on.
    const s = await start('untrusted', 'stale')
    try {
      const token = await pageToken(s.address, s.bootToken)
      const res = await fetch(`${s.address}/api/run`, {
        method: 'POST',
        headers: { 'x-waypost-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'make:vanished' }),
      })
      expect(res.status).toBe(404)
      const body = await res.text()
      expect(body).toContain('cached probe')
      expect(body).toContain('node-scripts')
      expect(body).not.toBe('not found')
    } finally {
      s.stop()
    }
  })

  test("a fresh listing still answers the bare 'not found'", async () => {
    // Nothing to explain when the catalog really is current: the id is simply
    // wrong, and inventing a cache story would be the opposite failure.
    const s = await start('untrusted')
    try {
      const token = await pageToken(s.address, s.bootToken)
      const res = await fetch(`${s.address}/api/run`, {
        method: 'POST',
        headers: { 'x-waypost-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'make:vanished' }),
      })
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('not found')
    } finally {
      s.stop()
    }
  })
})

describe('POST /api/trust — the injected seam', () => {
  test('a granting run writes to the injected home and leaves the real one alone', async () => {
    // Read-only against the developer's machine, and the whole point of `env`
    // and `home` being threaded into serve(): before this they defaulted, so
    // the test above would have granted trust on whoever ran it.
    const before = await trustStore({ tool: 'waypost' }).list()
    const s = await start('untrusted')
    try {
      expect((await post(s.address, await pageToken(s.address, s.bootToken))).status).toBe(200)
      expect(await trustStoreFor(s.home).list()).toHaveLength(1)
      expect(await trustStore({ tool: 'waypost' }).list()).toEqual(before)
    } finally {
      s.stop()
    }
  })
})

describe('GET /api/config — what the settings screen reads', () => {
  test('answers the merged config, the layers behind it, and where each value came from', async () => {
    const s = await start('untrusted')
    try {
      const token = await pageToken(s.address, s.bootToken)
      const res = await fetch(`${s.address}/api/config`, { headers: { 'x-waypost-token': token } })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        effective: Record<string, unknown>
        project: unknown
        sources: Record<string, string>
        locations: { project: string; user: string }
        trusted: boolean
        trustable: boolean
      }

      // Every leaf of the schema, so the screen can render a section per key
      // without asking whether the key exists.
      expect(body.effective['allowExec']).toBe(false)
      expect(body.effective['discovery']).toBe('auto')
      expect(body.effective['excludePaths']).toEqual([])
      expect(body.effective['runners']).toEqual({ disabled: [], order: [] })

      // `sources` is the whole reason this endpoint exists rather than the
      // page reading a file: it says which layer supplied each value. It is a
      // Map on the server, and a Map serialises as `{}` — so this asserts it
      // survived the crossing.
      expect(body.sources['allowExec']).toBe('default')
      expect(body.sources['runners.disabled']).toBe('default')

      // This project has no waypost.config.json, so the layer is absent
      // rather than empty — a distinction the screen shows.
      expect(body.project).toBeNull()
      expect(body.locations.project).toContain('waypost.config.json')

      // Nothing has been trusted in the injected home, and the gate says a
      // grant is what would change that.
      expect(body.trusted).toBe(false)
      expect(body.trustable).toBe(true)
    } finally {
      s.stop()
    }
  })

  test("a project file's values are reported, and attributed to the project layer", async () => {
    const s = await start('untrusted')
    try {
      await writeFile(
        join(s.root, 'waypost.config.json'),
        JSON.stringify({ runners: { disabled: ['make'] }, excludePaths: ['vendor'] }),
        'utf-8',
      )
      const token = await pageToken(s.address, s.bootToken)
      const res = await fetch(`${s.address}/api/config`, { headers: { 'x-waypost-token': token } })
      const body = (await res.json()) as {
        effective: Record<string, unknown>
        sources: Record<string, string>
      }
      expect(body.effective['runners']).toEqual({ disabled: ['make'], order: [] })
      expect(body.effective['excludePaths']).toEqual(['vendor'])
      expect(body.sources['runners.disabled']).toBe('project')
      expect(body.sources['excludePaths']).toBe('project')
      // Untouched keys still attribute to the layer that really supplied them.
      expect(body.sources['discovery']).toBe('default')
    } finally {
      s.stop()
    }
  })

  test('a project file that tries to raise allowExec is reported as ignored, with the reason', async () => {
    // The documented vulnerability, and the reason this screen must not draw
    // allowExec as a symmetric toggle: a repository cannot grant itself
    // permission to run its own code. The endpoint has to carry the warning
    // or the screen would show `false` with no explanation of why the file
    // saying `true` did nothing.
    const s = await start('untrusted')
    try {
      await writeFile(
        join(s.root, 'waypost.config.json'),
        JSON.stringify({ allowExec: true }),
        'utf-8',
      )
      const token = await pageToken(s.address, s.bootToken)
      const res = await fetch(`${s.address}/api/config`, { headers: { 'x-waypost-token': token } })
      const body = (await res.json()) as {
        effective: Record<string, unknown>
        sources: Record<string, string>
        warnings: string[]
      }
      expect(body.effective['allowExec']).toBe(false)
      expect(body.sources['allowExec']).toBe('default')
      expect(body.warnings.join(' ')).toContain('allowExec: true is ignored in a project file')
    } finally {
      s.stop()
    }
  })

  test('no token is a 401', async () => {
    const s = await start('untrusted')
    try {
      const res = await fetch(`${s.address}/api/config`)
      expect(res.status).toBe(401)
    } finally {
      s.stop()
    }
  })

  test('the BOOT token does not open it — API routes take the session token only', async () => {
    // The boot token rides in a URL, which is readable by any process on this
    // machine for as long as the command line survives. It signs a browser in
    // on the page route and is accepted nowhere else; a new endpoint that
    // forgot this would widen that.
    const s = await start('untrusted')
    try {
      const res = await fetch(`${s.address}/api/config?boot=${s.bootToken}`)
      expect(res.status).toBe(401)
    } finally {
      s.stop()
    }
  })

  test('a policy-trusted root reads as trusted, with no marker ever written', async () => {
    // A user-layer trust.paths entry covering this root, in place of a
    // `way trust` grant — the policy `@osdlc/trust-repo`'s `policyExecGate`
    // adds on top of the marker store. `trusted` must reflect it, or a
    // person who configured the policy would see the settings screen call
    // their own repository untrusted.
    const root = await project()
    const home = await temp('waypost-serve-home-')
    await mkdir(join(home, '.config', 'waypost'), { recursive: true })
    await writeFile(
      join(home, '.config', 'waypost', 'config.json'),
      JSON.stringify({ trust: { paths: [`${root}/**`, root] } }),
      'utf-8',
    )
    const options: ServeOptions = {
      project: makeProject(),
      root,
      collectOptions: { allowExec: true },
      port: 0,
      open: false,
      env: {},
      home,
    }
    const { server, bootToken } = await startServer(options)
    const address = `http://127.0.0.1:${server.port}`
    try {
      const token = await pageToken(address, bootToken)
      const res = await fetch(`${address}/api/config`, { headers: { 'x-waypost-token': token } })
      const body = (await res.json()) as { trusted: boolean }
      expect(body.trusted).toBe(true)
      // Genuinely policy-only: this case never posted to /api/trust.
      expect(await trustStoreFor(home).list()).toEqual([])
    } finally {
      void server.stop()
    }
  })
})

describe('GET /api/config — owner-trusted root', () => {
  test('a root whose origin owner is in trust.owners reads as trusted, with no marker', async () => {
    const base = await temp('waypost-serve-owner-')
    const repo = makeGitFixture({ dir: join(base, 'repo') })
    repo.git.remoteAdd('origin', 'https://github.com/AcmeOwner/dev.git')
    const home = await temp('waypost-serve-home-')
    await mkdir(join(home, '.config', 'waypost'), { recursive: true })
    await writeFile(
      join(home, '.config', 'waypost', 'config.json'),
      JSON.stringify({ trust: { owners: ['acmeowner'] } }),
      'utf-8',
    )
    const options: ServeOptions = {
      project: makeProject(),
      root: repo.dir,
      collectOptions: { allowExec: true },
      port: 0,
      open: false,
      env: {},
      home,
    }
    const { server, bootToken } = await startServer(options)
    const address = `http://127.0.0.1:${server.port}`
    try {
      const token = await pageToken(address, bootToken)
      const res = await fetch(`${address}/api/config`, { headers: { 'x-waypost-token': token } })
      const body = (await res.json()) as { trusted: boolean }
      expect(body.trusted).toBe(true)
      expect(await trustStoreFor(home).list()).toEqual([])
    } finally {
      void server.stop()
    }
  })
})

describe('POST /api/config — what the settings screen may write', () => {
  /** Save a patch and hand back the response plus the file it produced. */
  async function save(s: Started, set: Record<string, unknown>) {
    const token = await pageToken(s.address, s.bootToken)
    const res = await fetch(`${s.address}/api/config`, {
      method: 'POST',
      headers: { 'x-waypost-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ set }),
    })
    return res
  }

  async function fileAt(root: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(root, 'waypost.config.json'), 'utf-8')) as Record<
      string,
      unknown
    >
  }

  test('a patch is written, and the response is the config as it now is', async () => {
    const s = await start('untrusted')
    try {
      const res = await save(s, { 'runners.disabled': ['make'], excludePaths: ['vendor'] })
      expect(res.status).toBe(200)
      // Answered with the state the save produced, not the state it hoped for,
      // so the screen re-renders from one round trip.
      const body = (await res.json()) as {
        effective: Record<string, unknown>
        sources: Record<string, string>
      }
      expect(body.effective['runners']).toEqual({ disabled: ['make'], order: [] })
      expect(body.sources['runners.disabled']).toBe('project')
      expect(await fileAt(s.root)).toEqual({
        runners: { disabled: ['make'] },
        excludePaths: ['vendor'],
      })
    } finally {
      s.stop()
    }
  })

  test('a key this version does not know SURVIVES the save', async () => {
    // The reason the endpoint takes a patch and applies it to the raw file
    // rather than writing a validated document: validateConfig returns only
    // the keys it recognises, so writing its output would delete a setting
    // from a newer waypost without saying so.
    const s = await start('untrusted')
    try {
      await writeFile(
        join(s.root, 'waypost.config.json'),
        JSON.stringify({ futureSetting: { deep: true }, excludePaths: ['old'] }),
        'utf-8',
      )
      expect((await save(s, { excludePaths: ['new'] })).status).toBe(200)
      const file = await fileAt(s.root)
      expect(file['excludePaths']).toEqual(['new'])
      expect(file['futureSetting']).toEqual({ deep: true })
    } finally {
      s.stop()
    }
  })

  test('tools are refused: the page never writes a code path into the project file', async () => {
    const s = await start('untrusted')
    try {
      await writeFile(join(s.root, 'waypost.config.json'), JSON.stringify({ excludePaths: ['a'] }))
      const res = await save(s, { tools: ['./evil.mjs'] })
      expect(res.status).toBe(400)
      expect(await res.text()).toContain('way config set tools')
      expect(await fileAt(s.root)).toEqual({ excludePaths: ['a'] })
    } finally {
      s.stop()
    }
  })

  test('a key that is not a setting is refused, not silently dropped', async () => {
    const s = await start('untrusted')
    try {
      const res = await save(s, { notASetting: 1 })
      expect(res.status).toBe(400)
      expect(await res.text()).toContain('notASetting is not a setting')
      // And nothing was written.
      expect(existsSync(join(s.root, 'waypost.config.json'))).toBe(false)
    } finally {
      s.stop()
    }
  })

  test('trust.paths / trust.owners are refused in a project write, even empty', async () => {
    // Same boundary as allowExec: loadConfig drops a project-layer trust block
    // whole, so a write that accepted one could only mislead a reader.
    // One server per case: the page token `save` reads is issued once per boot.
    for (const set of [
      { 'trust.paths': ['/anywhere/**'] },
      { 'trust.owners': ['some-org'] },
      { 'trust.paths': [] },
    ]) {
      const s = await start('untrusted')
      try {
        const res = await save(s, set)
        expect(res.status).toBe(400)
        expect(await res.text()).toContain('cannot grant itself trust')
        expect(existsSync(join(s.root, 'waypost.config.json'))).toBe(false)
      } finally {
        s.stop()
      }
    }
  })

  test('allowExec: true is refused, with the trust instruction', async () => {
    // The documented vulnerability. loadConfig strips it after the fact, but a
    // write path that accepted it would put it in the file, where a reader
    // would see it and be wrong about the execution boundary.
    const s = await start('untrusted')
    try {
      const res = await save(s, { allowExec: true })
      expect(res.status).toBe(400)
      const detail = await res.text()
      expect(detail).toContain('cannot grant itself')
      expect(detail).toContain('Trust this repository')
      expect(existsSync(join(s.root, 'waypost.config.json'))).toBe(false)
    } finally {
      s.stop()
    }
  })

  test('allowExec: false IS allowed — a project may always lower execution', async () => {
    const s = await start('untrusted')
    try {
      expect((await save(s, { allowExec: false })).status).toBe(200)
      expect(await fileAt(s.root)).toEqual({ allowExec: false })
    } finally {
      s.stop()
    }
  })

  test('a value of the wrong type is refused and the file is untouched', async () => {
    const s = await start('untrusted')
    try {
      await writeFile(
        join(s.root, 'waypost.config.json'),
        JSON.stringify({ excludePaths: ['kept'] }),
        'utf-8',
      )
      const res = await save(s, { excludePaths: 'not-an-array' })
      expect(res.status).toBe(400)
      expect(await fileAt(s.root)).toEqual({ excludePaths: ['kept'] })
    } finally {
      s.stop()
    }
  })

  test('no token is a 401, and writes nothing', async () => {
    const s = await start('untrusted')
    try {
      const res = await fetch(`${s.address}/api/config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ set: { excludePaths: ['sneaked'] } }),
      })
      expect(res.status).toBe(401)
      expect(existsSync(join(s.root, 'waypost.config.json'))).toBe(false)
    } finally {
      s.stop()
    }
  })

  test('an unsupported method is a 405 rather than a silent read', async () => {
    const s = await start('untrusted')
    try {
      const token = await pageToken(s.address, s.bootToken)
      const res = await fetch(`${s.address}/api/config`, {
        method: 'DELETE',
        headers: { 'x-waypost-token': token },
      })
      expect(res.status).toBe(405)
    } finally {
      s.stop()
    }
  })
})

describe('DELETE /api/trust — revoking', () => {
  test('removes the grant, and the store says so', async () => {
    const s = await start('untrusted')
    try {
      const token = await pageToken(s.address, s.bootToken)
      // Grant first, through the real route, so what is revoked is a real
      // grant rather than an assumption about the store's contents.
      expect((await post(s.address, token)).status).toBe(200)
      expect(await trustStoreFor(s.home).list()).toHaveLength(1)

      const res = await fetch(`${s.address}/api/trust`, {
        method: 'DELETE',
        headers: { 'x-waypost-token': token },
      })
      expect(res.status).toBe(200)
      expect(((await res.json()) as { removed: boolean }).removed).toBe(true)
      expect(await trustStoreFor(s.home).list()).toHaveLength(0)
    } finally {
      s.stop()
    }
  })

  test('revoking what was never granted is not an error', async () => {
    // Idempotent on purpose: the caller wants the store to say "no", and it
    // already does. `removed` reports which of the two happened.
    const s = await start('untrusted')
    try {
      const token = await pageToken(s.address, s.bootToken)
      const res = await fetch(`${s.address}/api/trust`, {
        method: 'DELETE',
        headers: { 'x-waypost-token': token },
      })
      expect(res.status).toBe(200)
      expect(((await res.json()) as { removed: boolean }).removed).toBe(false)
    } finally {
      s.stop()
    }
  })

  test('is NOT gated on applicability, unlike the grant', async () => {
    // A grant is refused under --no-exec because it would be permission
    // nobody asked for. Removing permission has no matching harm, so the
    // same shape that refuses a POST must accept a DELETE.
    const s = await start('no-exec')
    try {
      const token = await pageToken(s.address, s.bootToken)
      expect((await post(s.address, token)).status).toBe(409)
      const res = await fetch(`${s.address}/api/trust`, {
        method: 'DELETE',
        headers: { 'x-waypost-token': token },
      })
      expect(res.status).toBe(200)
    } finally {
      s.stop()
    }
  })

  test('no token is a 401, and the store is untouched', async () => {
    const s = await start('untrusted')
    try {
      const token = await pageToken(s.address, s.bootToken)
      expect((await post(s.address, token)).status).toBe(200)
      const res = await fetch(`${s.address}/api/trust`, { method: 'DELETE' })
      expect(res.status).toBe(401)
      expect(await trustStoreFor(s.home).list()).toHaveLength(1)
    } finally {
      s.stop()
    }
  })
})

/**
 * A forced probe must be a probe taken AFTER whatever forced it.
 *
 * `?force` and the grant route both exist to answer with the world as it is
 * now. Joining a probe that was already running answers with the world as it
 * was when that probe started — before the grant, before the save.
 */
describe('a forced probe with one already in flight', () => {
  test('the grant answers with the post-grant catalog, not the one already collecting', async () => {
    const root = await project()
    const home = await temp('waypost-serve-home-')

    // A provider that blocks the FIRST collect and no other, so "a probe is in
    // flight" is a fact the test holds rather than a race it hopes for.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let collects = 0
    const gated: ToolDef = {
      id: 'gated',
      markers: [{ files: '/package.json', tier: 'files' }],
      roles: {
        runner: {
          kind: 'parse',
          chain: [{ label: 'task', hint: 'the task' }],
          async collect() {
            if (++collects === 1) await gate
            return { status: 'absent', tasks: [], diagnostics: [] }
          },
        },
      },
    }

    const options: ServeOptions = {
      project: makeProject([gated]),
      root,
      collectOptions: {
        only: ['gated'],
        allowExec: false,
        execWithheldHint: withheldHint('waypost'),
      },
      port: 0,
      open: false,
      env: {},
      home,
    }
    const { server, bootToken } = await startServer(options)
    const address = `http://127.0.0.1:${server.port}`
    try {
      const token = await pageToken(address, bootToken)
      // The page's first catalog request: a probe starts, and blocks.
      const first = fetch(`${address}/api/catalog`, { headers: { 'x-waypost-token': token } })
      while (collects === 0) await sleep(5)

      const granted = post(address, token)
      // The grant is recorded before the forced probe is asked for, so a
      // non-empty store means the route has reached it.
      while ((await trustStoreFor(home).list()).length === 0) await sleep(5)
      await sleep(20)
      release()

      const body = (await (await granted).json()) as { allowExec: boolean }
      expect(body.allowExec).toBe(true)
      await first
    } finally {
      void server.stop()
    }
  })
})

/**
 * Saving a setting has to change what the server collects.
 *
 * The dialog writes the file and says "Saved." A save that the running process
 * ignores is worse than a refusal: the file and the screen agree with each
 * other and neither describes the catalog the page is showing.
 */
describe('POST /api/config — the running server adopts what it saved', () => {
  async function twoRunners(): Promise<string> {
    const dir = await temp('waypost-config-')
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
      'utf-8',
    )
    await writeFile(join(dir, 'Makefile'), 'ship:\n\techo s\n', 'utf-8')
    return dir
  }

  test('disabling a runner takes it out of the next forced probe', async () => {
    const root = await twoRunners()
    const home = await temp('waypost-config-home-')
    const options: ServeOptions = {
      project: makeProject(),
      root,
      collectOptions: { allowExec: false },
      port: 0,
      open: false,
      env: {},
      home,
    }
    const { server, bootToken } = await startServer(options)
    const address = `http://127.0.0.1:${server.port}`
    try {
      const token = await pageToken(address, bootToken)
      const runners = async (): Promise<string[]> => {
        const res = await fetch(`${address}/api/catalog?force`, {
          headers: { 'x-waypost-token': token },
        })
        return ((await res.json()) as { reports: { runner: string }[] }).reports.map(
          (r) => r.runner,
        )
      }
      expect(await runners()).toContain('make')

      const saved = await fetch(`${address}/api/config`, {
        method: 'POST',
        headers: { 'x-waypost-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ set: { 'runners.disabled': ['make'] } }),
      })
      expect(saved.status).toBe(200)

      expect(await runners()).not.toContain('make')
    } finally {
      void server.stop()
    }
  })

  test('a saved runner order reorders the next forced probe', async () => {
    // `runners.order` is config-only — no flag sets it — so saving it is the
    // ONLY way it ever changes. A server that snapshotted it at boot can never
    // honour one, which is the same "the dialog said Saved and nothing moved"
    // defect as the collect options, hidden in one setting instead of all.
    const root = await twoRunners()
    const home = await temp('waypost-config-home-')
    const options: ServeOptions = {
      project: makeProject(),
      root,
      collectOptions: { allowExec: false },
      port: 0,
      open: false,
      env: {},
      home,
    }
    const { server, bootToken } = await startServer(options)
    const address = `http://127.0.0.1:${server.port}`
    try {
      const token = await pageToken(address, bootToken)
      const runners = async (): Promise<string[]> => {
        const res = await fetch(`${address}/api/catalog?force`, {
          headers: { 'x-waypost-token': token },
        })
        return ((await res.json()) as { reports: { runner: string }[] }).reports.map(
          (r) => r.runner,
        )
      }
      // Read rather than named, so the case does not depend on which runner
      // ids this fixture happens to detect. The order applies within a group,
      // so the pick is the last task runner.
      const before = (await runners()).filter((r) => groupOf(r).id === 'tasks')
      expect(before.length).toBeGreaterThan(1)
      const last = before[before.length - 1]!

      const saved = await fetch(`${address}/api/config`, {
        method: 'POST',
        headers: { 'x-waypost-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ set: { 'runners.order': [last] } }),
      })
      expect(saved.status).toBe(200)

      expect((await runners())[0]).toBe(last)
    } finally {
      void server.stop()
    }
  })

  test('a runner excluded on the command line stays excluded across a save', async () => {
    // The save must not take back a flag. `--exclude make` is the user's most
    // recent explicit instruction about make, and a settings write that
    // touches another key cannot revoke it.
    const root = await twoRunners()
    const home = await temp('waypost-config-home-')
    const options: ServeOptions = {
      project: makeProject(),
      root,
      collectOptions: { allowExec: false, exclude: ['make'] },
      pinnedByFlag: ['exclude'],
      port: 0,
      open: false,
      env: {},
      home,
    }
    const { server, bootToken } = await startServer(options)
    const address = `http://127.0.0.1:${server.port}`
    try {
      const token = await pageToken(address, bootToken)
      const saved = await fetch(`${address}/api/config`, {
        method: 'POST',
        headers: { 'x-waypost-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ set: { 'runners.order': ['make'] } }),
      })
      expect(saved.status).toBe(200)

      const res = await fetch(`${address}/api/catalog?force`, {
        headers: { 'x-waypost-token': token },
      })
      const reports = ((await res.json()) as { reports: { runner: string }[] }).reports
      expect(reports.map((r) => r.runner)).not.toContain('make')
    } finally {
      void server.stop()
    }
  })
})

describe('POST /api/trust — project tools', () => {
  test("a grant says the project file's tools load at the next start", async () => {
    const s = await start('untrusted', 'cold', true)
    try {
      const res = await post(s.address, await pageToken(s.address, s.bootToken))
      expect(res.status).toBe(200)
      const body = (await res.json()) as { note?: string }
      expect(body.note).toBe(
        'the tools waypost.config.json names load the next time way starts with execution allowed',
      )
    } finally {
      s.stop()
    }
  })

  test('without pending tools the grant carries no note', async () => {
    const s = await start('untrusted')
    try {
      const res = await post(s.address, await pageToken(s.address, s.bootToken))
      expect(((await res.json()) as { note?: string }).note).toBeUndefined()
    } finally {
      s.stop()
    }
  })
})
