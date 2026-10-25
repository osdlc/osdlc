/**
 * The web view's server, over real HTTP: sign-in, the command routes the page
 * calls, the confirmed trust grant and the run hand-off.
 *
 * HOME is a throwaway directory in every case, so no test grants trust or
 * writes config on the developer's machine. The hand-off is injected, so no
 * task runs.
 */

import { afterAll, describe, expect, test, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { request as httpRequest } from 'node:http'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { HttpApi } from '@osdlc/cli-tool/http'
import { resolveTrustRoot } from '@osdlc/trust-repo'

import { abortOnSignals } from '../src/commands/browse.ts'
import type { CatalogBody } from '../src/commands/list.ts'
import { createWayApp } from '../src/commands/index.ts'
import { createSession } from '../src/core/session.ts'
import { createSignIn } from '../src/serve/auth.ts'
import { createCatalogShare, type ProgressSink } from '../src/serve/catalog-share.ts'
import { viewPath } from '../src/core/saved-view.ts'
import { createRoutes } from '../src/serve/routes.ts'
import { browserOpener, serve, startServer, type WebServer } from '../src/serve/index.ts'
import { appTrustStore } from '../src/trust-store.ts'
import { fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string> = {}): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

interface Started {
  web: WebServer
  address: string
  dir: string
  home: string
  /** Every plan the server handed off. */
  handed: { argv: string[]; cwd: string }[]
  /** What the server wrote to stderr. */
  err: string[]
  /** Sign in and return the bearer token. */
  token(): Promise<string>
  /** `POST /api/commands/<words>` with the bearer token. */
  call(words: string[], body?: unknown, headers?: Record<string, string>): Promise<Response>
}

async function start(files: Record<string, string> = {}): Promise<Started> {
  const dir = await root({
    'package.json': JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
    ...files,
  })
  const home = await root()
  const env = { HOME: home, PATH: process.env['PATH'] }
  const { app } = createWayApp({ home })
  const session = await createSession({ dir, cwd: dir, env, home })
  const handed: Started['handed'] = []
  const err: string[] = []
  const web = await startServer({
    session,
    app,
    globals: {},
    cwd: dir,
    port: 0,
    open: false,
    stdout: () => {},
    stderr: (text) => err.push(text),
    handOff: (plan) => {
      handed.push({ argv: plan.argv, cwd: plan.cwd })
      return { exit: 0 }
    },
  })
  const address = `http://127.0.0.1:${web.server.port}`
  let bearer: string | undefined
  const token = async (): Promise<string> => {
    if (bearer !== undefined) return bearer
    const res = await fetch(`${address}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ boot: web.signIn.bootToken }),
    })
    bearer = ((await res.json()) as { token: string }).token
    return bearer
  }
  return {
    web,
    address,
    dir,
    home,
    handed,
    err,
    token,
    async call(words, body = {}, headers = {}) {
      return fetch(`${address}/api/commands/${words.join('/')}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${await token()}`,
          ...headers,
        },
        body: JSON.stringify(body),
      })
    },
  }
}

/** A GET with a Host header, which fetch does not let a caller set. */
function getWithHost(address: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${address}/`, { headers: { host } }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end()
  })
}

describe('the page', () => {
  test('is served with no token in it, with the app name and the saved theme', async () => {
    const s = await start()
    try {
      await s.call(['config', 'set'], { key: 'theme', value: '"dark"', user: true })
      const res = await fetch(`${s.address}/`)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
      const html = await res.text()
      expect(html).toContain('<title>wayfinder</title>')
      expect(html).toContain(
        `<html lang="en" data-theme="dark" data-platform="${process.platform}">`,
      )
      expect(html).not.toContain(await s.token())
      expect(html).not.toContain(s.web.signIn.bootToken)
    } finally {
      await s.web.stop()
    }
  })

  test('runs only its own script, with a fresh nonce per load', async () => {
    const s = await start()
    try {
      const nonces: string[] = []
      for (let i = 0; i < 2; i++) {
        const res = await fetch(`${s.address}/`)
        const policy = res.headers.get('content-security-policy') ?? ''
        for (const part of [
          "default-src 'none'",
          "connect-src 'self'",
          "base-uri 'none'",
          "form-action 'none'",
        ]) {
          expect(policy).toContain(part)
        }
        const nonce = /script-src 'nonce-([^']+)'/.exec(policy)?.[1]
        expect(nonce).toBeDefined()
        expect(await res.text()).toContain(`<script type="module" nonce="${nonce}">`)
        nonces.push(nonce!)
      }
      expect(nonces[0]).not.toBe(nonces[1])
    } finally {
      await s.web.stop()
    }
  })

  test('a Host that is not loopback is refused with 403', async () => {
    const s = await start()
    try {
      expect(await getWithHost(s.address, 'evil.example')).toBe(403)
      expect(await getWithHost(s.address, `127.0.0.1:${s.web.server.port}`)).toBe(200)
    } finally {
      await s.web.stop()
    }
  })

  test('an Origin from another site is refused with 403', async () => {
    const s = await start()
    try {
      const res = await fetch(`${s.address}/`, { headers: { origin: 'https://evil.example' } })
      expect(res.status).toBe(403)
    } finally {
      await s.web.stop()
    }
  })

  test('an unknown path is 404', async () => {
    const s = await start()
    try {
      expect((await fetch(`${s.address}/nope`)).status).toBe(404)
    } finally {
      await s.web.stop()
    }
  })
})

describe('POST /session', () => {
  async function session(address: string, body: unknown): Promise<Response> {
    return fetch(`${address}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  test('trades the boot token for the bearer token once', async () => {
    const s = await start()
    try {
      const first = await session(s.address, { boot: s.web.signIn.bootToken })
      expect(first.status).toBe(200)
      const { token } = (await first.json()) as { token: string }
      expect(token).toMatch(/^[0-9a-f]{32}$/)
      const again = await session(s.address, { boot: s.web.signIn.bootToken })
      expect(again.status).toBe(401)
    } finally {
      await s.web.stop()
    }
  })

  test('the boot token redeemed twice is refused with a warning, and the server keeps serving', async () => {
    const s = await start()
    try {
      const token = await s.token()
      const again = await session(s.address, { boot: s.web.signIn.bootToken })
      expect(again.status).toBe(401)
      expect(s.err.join('')).toContain('way: warning: the sign-in link was used again')
      expect(s.err.join('')).toContain('stop the server (Ctrl-C) and start it again')
      expect(s.err.join('')).not.toContain('press Enter')
      const res = await fetch(`${s.address}/api/commands/config/path`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: '{}',
      })
      expect(res.status).toBe(200)
    } finally {
      await s.web.stop()
    }
    expect(await s.web.finished).toBe(null)
  })

  test('a wrong boot token is 401, and leaves the right one usable', async () => {
    const s = await start()
    try {
      expect((await session(s.address, { boot: 'f'.repeat(32) })).status).toBe(401)
      expect((await session(s.address, {})).status).toBe(401)
      expect((await session(s.address, { boot: s.web.signIn.bootToken })).status).toBe(200)
    } finally {
      await s.web.stop()
    }
  })

  test('a body that is not JSON is refused', async () => {
    const s = await start()
    try {
      const res = await fetch(`${s.address}/session`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: s.web.signIn.bootToken,
      })
      expect(res.status).toBe(415)
    } finally {
      await s.web.stop()
    }
  })

  test('a chunked body past the limit is refused without reading it all', async () => {
    const routes = createRoutes({
      api: {
        handles: () => false,
        checkOrigin: () => null,
        hasToken: () => false,
        token: 't',
      } as unknown as HttpApi,
      signIn: createSignIn(),
      page: async () => '',
      resolveRun: async () => ({ ok: false, status: 500, error: {} }),
      handOff: () => {},
    })
    // 16 MB in 64 KB chunks. Reading stops soon after the 64 KB limit.
    let pulled = 0
    const endless = new ReadableStream<Uint8Array>({
      pull: (c) => {
        if (pulled >= 16 * 1024 * 1024) return c.close()
        pulled += 64 * 1024
        c.enqueue(new Uint8Array(64 * 1024))
      },
    })
    const res = await routes(
      new Request('http://127.0.0.1/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: endless,
        duplex: 'half',
      } as RequestInit),
    )
    expect(res.status).toBe(413)
    expect(pulled).toBeLessThan(1024 * 1024)
  })

  test('GET is 405', async () => {
    const s = await start()
    try {
      expect((await fetch(`${s.address}/session`)).status).toBe(405)
    } finally {
      await s.web.stop()
    }
  })
})

describe('the boot token', () => {
  test('expires a minute after it is armed', () => {
    let now = 1_000
    const signIn = createSignIn(() => now)
    signIn.arm()
    now += 60_001
    expect(signIn.redeem(signIn.bootToken)).toBe(false)
  })

  test('the right token sent again reports a replay; a wrong one does not', () => {
    let replays = 0
    const signIn = createSignIn(Date.now, () => replays++)
    expect(signIn.redeem('f'.repeat(32))).toBe(false)
    expect(signIn.redeem(signIn.bootToken)).toBe(true)
    expect(signIn.redeem('f'.repeat(32))).toBe(false)
    expect(replays).toBe(0)
    expect(signIn.redeem(signIn.bootToken)).toBe(false)
    expect(replays).toBe(1)
  })

  test('renew replaces the boot token, armed, and the old one stops working', () => {
    let now = 1_000
    const signIn = createSignIn(() => now)
    const old = signIn.bootToken
    const fresh = signIn.renew()
    expect(fresh).not.toBe(old)
    expect(signIn.bootToken).toBe(fresh)
    expect(signIn.redeem(old)).toBe(false)
    expect(signIn.redeem(fresh)).toBe(true)
    // Once more after a redeem: a second tab gets its own link.
    const third = signIn.renew()
    now += 60_001
    expect(signIn.redeem(third)).toBe(false)
  })

  test('does not expire before it is armed', () => {
    let now = 1_000
    const signIn = createSignIn(() => now)
    now += 10 * 60_000
    expect(signIn.redeem(signIn.bootToken)).toBe(true)
  })
})

describe('the command routes', () => {
  test('config path answers a signed-in page, which the page uses to check a kept token', async () => {
    const s = await start()
    try {
      expect((await s.call(['config', 'path'])).status).toBe(200)
    } finally {
      await s.web.stop()
    }
  })

  test('no bearer token is 401', async () => {
    const s = await start()
    try {
      const res = await fetch(`${s.address}/api/commands/list`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      expect(res.status).toBe(401)
    } finally {
      await s.web.stop()
    }
  })

  test('list refuses a directory of its own: the served one is fixed', async () => {
    const s = await start()
    const other = await root({ justfile: 'secret:\n  echo s\n' })
    try {
      const res = await s.call(['list'], { dir: other })
      expect(res.status).toBe(400)
      expect(JSON.stringify(await res.json())).toContain('fixed when the web view starts')
      expect((await s.call(['list'], {})).status).toBe(200)
    } finally {
      await s.web.stop()
    }
  })

  test('the boot token is not a bearer token', async () => {
    const s = await start()
    try {
      const res = await s.call(['list'], {}, { authorization: `Bearer ${s.web.signIn.bootToken}` })
      expect(res.status).toBe(401)
    } finally {
      await s.web.stop()
    }
  })

  test('list answers the catalog for the served root', async () => {
    const s = await start()
    try {
      const res = await s.call(['list'])
      expect(res.status).toBe(200)
      const doc = (await res.json()) as { reports: { tasks: { display: string }[] }[] }
      const displays = doc.reports.flatMap((r) => r.tasks.map((t) => t.display))
      expect(displays).toContain('npm run build')
    } finally {
      await s.web.stop()
    }
  })

  test('a trust grant answers 428, then grants with the nonce', async () => {
    const s = await start()
    try {
      const store = appTrustStore({ env: {}, home: s.home })
      const first = await s.call(['trust'])
      expect(first.status).toBe(428)
      const { nonce } = (await first.json()) as { nonce: string }
      expect(await store.list()).toEqual([])
      const second = await s.call(['trust'], {}, { 'x-confirm': nonce })
      expect(second.status).toBe(200)
      expect(await store.list()).toEqual([await resolveTrustRoot(s.dir)])
      // A nonce works once.
      const replay = await s.call(['trust'], {}, { 'x-confirm': nonce })
      expect(replay.status).toBe(403)
    } finally {
      await s.web.stop()
    }
  })

  test('a tool grant answers 428, then grants that scope with the nonce', async () => {
    const s = await start()
    try {
      const store = appTrustStore({ env: {}, home: s.home })
      const first = await s.call(['trust'], { scope: 'mise' })
      expect(first.status).toBe(428)
      const { nonce } = (await first.json()) as { nonce: string }
      expect(await store.listGrants()).toEqual([])
      const second = await s.call(['trust'], { scope: 'mise' }, { 'x-confirm': nonce })
      expect(second.status).toBe(200)
      expect((await store.listGrants()).map((g) => g.scope)).toEqual(['mise'])
    } finally {
      await s.web.stop()
    }
  })

  test("a tool grant's nonce does not confirm a whole-repository grant", async () => {
    const s = await start()
    try {
      const store = appTrustStore({ env: {}, home: s.home })
      const first = await s.call(['trust'], { scope: 'mise' })
      const { nonce } = (await first.json()) as { nonce: string }
      const other = await s.call(['trust'], {}, { 'x-confirm': nonce })
      expect(other.status).toBe(403)
      expect(await store.listGrants()).toEqual([])
    } finally {
      await s.web.stop()
    }
  })

  test("a tool's untrust runs without a confirmation and leaves other grants", async () => {
    const s = await start()
    try {
      const store = appTrustStore({ env: {}, home: s.home })
      const resolved = await resolveTrustRoot(s.dir)
      await store.trust(resolved, 'mise')
      await store.trust(resolved)
      const res = await s.call(['trust'], { untrust: true, scope: 'mise' })
      expect(res.status).toBe(200)
      expect((await store.listGrants()).map((g) => g.scope ?? '*')).toEqual(['*'])
    } finally {
      await s.web.stop()
    }
  })

  test('providers answers each tool with its homepage, description and language', async () => {
    const s = await start()
    try {
      const res = await s.call(['providers'])
      expect(res.status).toBe(200)
      const doc = (await res.json()) as {
        providers: { id: string; homepage: string | null; language: string }[]
      }
      const npm = doc.providers.find((p) => p.id === 'npm')!
      expect(npm.homepage).toMatch(/^https:\/\//)
      expect(typeof npm.language).toBe('string')
    } finally {
      await s.web.stop()
    }
  })

  test('untrust runs without a confirmation', async () => {
    const s = await start()
    try {
      const store = appTrustStore({ env: {}, home: s.home })
      await store.trust(await resolveTrustRoot(s.dir))
      const res = await s.call(['trust'], { untrust: true })
      expect(res.status).toBe(200)
      expect(await store.list()).toEqual([])
    } finally {
      await s.web.stop()
    }
  })

  test('allowExec and trust settings cannot be written over HTTP', async () => {
    const s = await start()
    try {
      const exec = await s.call(['config', 'set'], { key: 'allowExec', value: 'true', user: true })
      expect(exec.status).toBe(403)
      const paths = await s.call(['config', 'set'], {
        key: 'trust.paths',
        value: '["/"]',
        user: true,
      })
      expect(paths.status).toBe(403)
    } finally {
      await s.web.stop()
    }
  })

  test('tools cannot be set, and trust cannot be unset, over HTTP', async () => {
    const s = await start()
    try {
      const tools = await s.call(['config', 'set'], {
        key: 'tools',
        value: '["./evil.js"]',
        user: true,
      })
      expect(tools.status).toBe(403)
      const trust = await s.call(['config', 'unset'], { key: 'trust', user: true })
      expect(trust.status).toBe(403)
      const exec = await s.call(['config', 'unset'], { key: 'allowExec', user: true })
      expect(exec.status).toBe(403)
    } finally {
      await s.web.stop()
    }
  })

  test('a project setting is written to the project file', async () => {
    const s = await start()
    try {
      const res = await s.call(['config', 'set'], {
        key: 'discovery',
        value: '"walk"',
        project: true,
      })
      expect(res.status).toBe(200)
      const written = JSON.parse(await readFile(join(s.dir, 'wayfinder.config.json'), 'utf-8'))
      expect(written).toMatchObject({ discovery: 'walk' })
    } finally {
      await s.web.stop()
    }
  })
})

describe('POST /run', () => {
  async function run(s: Started, body: unknown, token?: string): Promise<Response> {
    return fetch(`${s.address}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token ?? (await s.token())}`,
      },
      body: JSON.stringify(body),
    })
  }

  async function taskId(s: Started): Promise<string> {
    const doc = (await (await s.call(['list'])).json()) as {
      reports: { tasks: { id: string; display: string }[] }[]
    }
    return doc.reports.flatMap((r) => r.tasks).find((t) => t.display === 'npm run build')!.id
  }

  test('hands the terminal to the task, then a second run is 409', async () => {
    const s = await start()
    try {
      const id = await taskId(s)
      // Sent together: the server stops once a run is handed off, so only a
      // request already in flight can be answered 409.
      const [first, second] = await Promise.all([run(s, { id, args: ['--watch'] }), run(s, { id })])
      expect(first.status).toBe(200)
      const answer = (await first.json()) as { ok: boolean; argv: string[] }
      expect(answer.ok).toBe(true)
      expect(answer.argv.slice(-1)).toEqual(['--watch'])
      expect(second.status).toBe(409)
      expect(await s.web.finished).toBe(0)
      expect(s.handed).toEqual([{ argv: answer.argv, cwd: expect.any(String) }])
    } finally {
      await s.web.stop()
    }
  })

  test('runs a task from the saved listing once its runner, probed again, agrees', async () => {
    const s = await start()
    try {
      const id = await taskId(s)
      // The stored probes are gone: the run reads the saved listing, then
      // probes node-scripts alone.
      await rm(join(s.home, '.cache', 'wayfinder', 'reports'), { recursive: true, force: true })
      const res = await run(s, { id })
      expect(res.status).toBe(200)
      expect(await s.web.finished).toBe(0)
      expect(s.handed).toHaveLength(1)
    } finally {
      await s.web.stop()
    }
  })

  test('refuses a task that changed since the listing, with the command it runs now', async () => {
    const s = await start({ Procfile: 'web: echo one\n' })
    try {
      await s.call(['list'])
      const id = 'procfile:Procfile:web'
      // The id is the same; the command it runs is not.
      await writeFile(join(s.dir, 'Procfile'), 'web: echo two\n')
      const changed = await run(s, { id })
      expect(changed.status).toBe(412)
      const body = (await changed.json()) as { code: string; message: string }
      expect(body.code).toBe('task-changed')
      expect(body.message).toContain('changed since the listing')
      expect(body.message).toContain('echo two')
      await s.call(['list'])
      await writeFile(join(s.dir, 'Procfile'), 'worker: echo w\n')
      const gone = await run(s, { id })
      expect(gone.status).toBe(412)
      expect(((await gone.json()) as { message: string }).message).toContain('not found')
      expect(s.handed).toEqual([])
    } finally {
      await s.web.stop()
    }
  })

  test('an unknown id is 404, and a later run still works', async () => {
    const s = await start()
    try {
      const res = await run(s, { id: 'nope:nothing' })
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: 'task-not-found' })
      expect(s.handed).toEqual([])
      expect((await run(s, { id: await taskId(s) })).status).toBe(200)
    } finally {
      await s.web.stop()
    }
  })

  test('a malformed body is 400', async () => {
    const s = await start()
    try {
      expect((await run(s, { id: 3 })).status).toBe(400)
      expect((await run(s, { id: 'x', args: [1] })).status).toBe(400)
    } finally {
      await s.web.stop()
    }
  })

  test('a wrong bearer token is 401', async () => {
    const s = await start()
    try {
      expect((await run(s, { id: 'x' }, 'wrong')).status).toBe(401)
    } finally {
      await s.web.stop()
    }
  })
})

describe('the browser opener', () => {
  test('is open, xdg-open, or rundll32 on Windows', () => {
    expect(browserOpener('darwin')).toEqual({ binary: 'open', args: [] })
    expect(browserOpener('linux')).toEqual({ binary: 'xdg-open', args: [] })
    expect(browserOpener('win32')).toEqual({
      binary: 'rundll32',
      args: ['url.dll,FileProtocolHandler'],
    })
  })
})

describe('stopping', () => {
  test('an aborted signal stops the server and settles null', async () => {
    const dir = await root({ 'package.json': JSON.stringify({ name: 'p', scripts: {} }) })
    const home = await root()
    const env = { HOME: home, PATH: process.env['PATH'] }
    const { app } = createWayApp({ home })
    const session = await createSession({ dir, cwd: dir, env, home })
    const aborter = new AbortController()
    const web = await startServer({
      session,
      app,
      globals: {},
      cwd: dir,
      signal: aborter.signal,
      stdout: () => {},
      stderr: () => {},
    })
    const address = `http://127.0.0.1:${web.server.port}`
    expect((await fetch(`${address}/`)).status).toBe(200)
    aborter.abort(130)
    expect(await web.finished).toBeNull()
    await expect(fetch(`${address}/`)).rejects.toThrow()
  })
})

describe('the held catalog', () => {
  test("the page's first reads wait on neither a store read nor a second probe", async () => {
    const dir = await root({
      'package.json': JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
    })
    const home = await root()
    const env = { HOME: home, PATH: process.env['PATH'] }
    const { app, share } = createWayApp({ home })
    const session = await createSession({ dir, cwd: dir, env, home })
    // An earlier run saved its view.
    await session.catalog()
    // The probe serve starts waits until the test lets it go.
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const probe = session.catalog.bind(session)
    Object.assign(session, {
      catalog: async (opts?: { cached?: boolean }) => {
        if (opts?.cached !== true) await gate
        return probe(opts)
      },
    })
    const probes: string[] = []
    const fresh = share.fresh.bind(share)
    share.fresh = (key, run, opts) =>
      fresh(
        key,
        (signal, emit) => {
          probes.push(key)
          return run(signal, emit)
        },
        opts,
      )

    const aborter = new AbortController()
    let out = ''
    const finished = serve({
      session,
      app,
      share,
      globals: {},
      cwd: dir,
      open: false,
      signal: aborter.signal,
      stdout: (text) => {
        out += text
      },
      stderr: () => {},
    })
    await vi.waitFor(() => expect(out).toMatch(/\?boot=[0-9a-f]+/))
    expect(out).toContain('the last listing')
    const address = out.match(/(http:\/\/127\.0\.0\.1:\d+)/)![1]!
    const boot = out.match(/\?boot=([0-9a-f]+)/)![1]!
    const signed = await fetch(`${address}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ boot }),
    })
    const { token } = (await signed.json()) as { token: string }
    const list = (body: object): Promise<Response> =>
      fetch(`${address}/api/commands/list`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })

    // Answered while serve's probe is still held: from the held catalog.
    const cached = (await (await list({ cached: true })).json()) as { source: string }
    expect(cached.source).toBe('cached')
    // The page's first fresh read joins serve's probe rather than starting its own.
    const pending = list({ join: true })
    // serve itself and the request both wait on it before it is let go.
    await vi.waitFor(() => expect(share.waiting(session.viewKey())).toBe(2))
    release()
    const doc = (await (await pending).json()) as {
      source: string
      reports: { tasks: { display: string }[] }[]
    }
    expect(doc.source).toBe('fresh')
    expect(doc.reports.flatMap((r) => r.tasks.map((t) => t.display))).toContain('npm run build')
    expect(probes).toHaveLength(1)
    aborter.abort(130)
    expect(await finished).toBeNull()
  })

  test('with no saved view, the page streams each runner from the probe serve started', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
      Makefile: 'all:\n\techo all\n',
    })
    const home = await root()
    const env = { HOME: home, PATH: process.env['PATH'] }
    const { app, share } = createWayApp({ home })
    const session = await createSession({ dir, cwd: dir, env, home })
    // serve's probe waits until the test lets it go.
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const probe = session.catalog.bind(session)
    let probes = 0
    Object.assign(session, {
      catalog: async (opts?: Parameters<typeof probe>[0]) => {
        if (opts?.cached !== true) {
          probes++
          await gate
        }
        return probe(opts)
      },
    })
    const aborter = new AbortController()
    let out = ''
    const finished = serve({
      session,
      app,
      share,
      globals: {},
      cwd: dir,
      open: false,
      signal: aborter.signal,
      stdout: (text) => {
        out += text
      },
      stderr: () => {},
    })
    await vi.waitFor(() => expect(out).toMatch(/\?boot=[0-9a-f]+/))
    expect(out).toContain('nothing yet')
    const address = out.match(/(http:\/\/127\.0\.0\.1:\d+)/)![1]!
    const boot = out.match(/\?boot=([0-9a-f]+)/)![1]!
    const signed = await fetch(`${address}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ boot }),
    })
    const { token } = (await signed.json()) as { token: string }
    const streamed = fetch(`${address}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/x-ndjson',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cached: true, progress: true }),
    })
    await vi.waitFor(() => expect(share.waiting(session.viewKey())).toBe(2))
    release()
    const res = await streamed
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const lines = (await res.text())
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>)
    const events = lines.slice(0, -1)
    const doc = lines.at(-1)!
    expect(events.every((e) => e['kind'] === 'catalog-progress')).toBe(true)
    expect(events[0]!['report']).toBeUndefined()
    const answered = events.slice(1).map((e) => (e['report'] as { runner: string }).runner)
    expect(answered.sort()).toEqual(
      (doc['reports'] as { runner: string }[]).map((r) => r.runner).sort(),
    )
    expect(events.at(-1)!['pending']).toEqual([])
    expect(doc['kind']).toBe('catalog')
    expect(doc['source']).toBe('fresh')
    // One probe: the page joined serve's.
    expect(probes).toBe(1)
    aborter.abort(130)
    expect(await finished).toBeNull()
  })

  const body = (generatedAt: string): CatalogBody => ({ generatedAt }) as never
  const held = (): {
    promise: Promise<CatalogBody>
    resolve: (b: CatalogBody) => void
    reject: (e: unknown) => void
  } => {
    let resolve: (b: CatalogBody) => void = () => {}
    let reject: (e: unknown) => void = () => {}
    const promise = new Promise<CatalogBody>((ok, fail) => {
      resolve = ok
      reject = fail
    })
    return { promise, resolve, reject }
  }

  test("a waiter that joins late gets the probe's progress lines sent before it joined", async () => {
    const share = createCatalogShare()
    share.activate()
    const done = held()
    let emit: ProgressSink = () => {}
    const probe = (_signal: AbortSignal, sink: ProgressSink): Promise<CatalogBody> => {
      emit = sink
      return done.promise
    }
    const early: number[] = []
    const late: number[] = []
    const a = share.fresh('k', probe, { join: true, onEvent: (l) => early.push(l.pending.length) })
    await vi.waitFor(() => expect(share.probing('k')).toBe(true))
    await Promise.resolve()
    emit({ pending: ['a', 'b'], total: 2 })
    emit({ pending: ['b'], total: 2 })
    const b = share.fresh('k', probe, { join: true, onEvent: (l) => late.push(l.pending.length) })
    emit({ pending: [], total: 2 })
    done.resolve(body('done'))
    await Promise.all([a, b])
    expect(early).toEqual([2, 1, 0])
    expect(late).toEqual([2, 1, 0])
    expect(share.probing('k')).toBe(false)
    // A line after the end goes nowhere.
    emit({ pending: [], total: 2 })
    expect(early).toHaveLength(3)
  })

  test('a listener that throws gets no more lines; the probe and the other waiters go on', async () => {
    const share = createCatalogShare()
    share.activate()
    const done = held()
    let emit: ProgressSink = () => {}
    const probe = (_signal: AbortSignal, sink: ProgressSink): Promise<CatalogBody> => {
      emit = sink
      return done.promise
    }
    let thrown = 0
    const good: number[] = []
    const bad = share.fresh('k', probe, {
      join: true,
      onEvent: () => {
        thrown++
        throw new Error('the tab went away')
      },
    })
    const fine = share.fresh('k', probe, { join: true, onEvent: (l) => good.push(l.total) })
    await vi.waitFor(() => expect(share.probing('k')).toBe(true))
    await Promise.resolve()
    emit({ pending: ['a'], total: 1 })
    emit({ pending: [], total: 1 })
    expect(thrown).toBe(1)
    expect(good).toEqual([1, 1])
    expect(share.waiting('k')).toBe(2)
    done.resolve(body('done'))
    await expect(bad).resolves.toEqual(body('done'))
    await expect(fine).resolves.toEqual(body('done'))
    expect(share.waiting('k')).toBe(0)
  })

  test('a late joiner whose listener throws on the replay is not left counted', async () => {
    const share = createCatalogShare()
    share.activate()
    const done = held()
    let emit: ProgressSink = () => {}
    const probe = (_signal: AbortSignal, sink: ProgressSink): Promise<CatalogBody> => {
      emit = sink
      return done.promise
    }
    const first = share.fresh('k', probe, { join: true })
    await vi.waitFor(() => expect(share.probing('k')).toBe(true))
    await Promise.resolve()
    emit({ pending: ['a'], total: 1 })
    const late = share.fresh('k', probe, {
      join: true,
      onEvent: () => {
        throw new Error('broken')
      },
    })
    expect(share.waiting('k')).toBe(2)
    done.resolve(body('done'))
    await Promise.all([first, late])
    expect(share.waiting('k')).toBe(0)
  })

  test('a tab that leaves mid-stream stops the probe it started', async () => {
    const share = createCatalogShare()
    share.activate()
    let emit: ProgressSink = () => {}
    let seen: AbortSignal | undefined
    const probe = (signal: AbortSignal, sink: ProgressSink): Promise<CatalogBody> => {
      seen = signal
      emit = sink
      return new Promise<CatalogBody>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    }
    const tab = new AbortController()
    const lines: number[] = []
    const page = share.fresh('k', probe, {
      join: false,
      signal: tab.signal,
      onEvent: (l) => lines.push(l.pending.length),
    })
    await vi.waitFor(() => expect(seen).toBeDefined())
    emit({ pending: ['a'], total: 1 })
    tab.abort(new Error('tab closed'))
    await expect(page).rejects.toThrow('tab closed')
    expect(seen!.aborted).toBe(true)
    expect(share.waiting('k')).toBe(0)
    emit({ pending: [], total: 1 })
    expect(lines).toEqual([1])
  })

  test('a tab that leaves mid-stream stops getting lines; the boot probe goes on', async () => {
    const share = createCatalogShare()
    share.activate()
    const done = held()
    let emit: ProgressSink = () => {}
    let seen: AbortSignal | undefined
    const probe = (signal: AbortSignal, sink: ProgressSink): Promise<CatalogBody> => {
      seen = signal
      emit = sink
      return done.promise
    }
    // serve starts the first probe under its own signal.
    const boot = share.fresh('k', probe, { join: true, signal: share.signal })
    const tab = new AbortController()
    const lines: number[] = []
    const page = share.fresh('k', probe, {
      join: true,
      signal: tab.signal,
      onEvent: (l) => lines.push(l.pending.length),
    })
    await vi.waitFor(() => expect(seen).toBeDefined())
    emit({ pending: ['a', 'b'], total: 2 })
    tab.abort(new Error('tab closed'))
    await expect(page).rejects.toThrow('tab closed')
    emit({ pending: ['b'], total: 2 })
    expect(lines).toEqual([2])
    expect(share.waiting('k')).toBe(1)
    expect(seen!.aborted).toBe(false)
    done.resolve(body('done'))
    await expect(boot).resolves.toEqual(body('done'))
  })

  test('a failed shared probe fails every waiter, and the next request probes again', async () => {
    const share = createCatalogShare()
    share.activate()
    const first = held()
    let probes = 0
    const probe = (): Promise<CatalogBody> => {
      probes++
      return probes === 1 ? first.promise : Promise.resolve(body('second'))
    }
    const a = share.fresh('k', probe, { join: true })
    const b = share.fresh('k', probe, { join: true })
    expect(share.waiting('k')).toBe(2)
    first.reject(new Error('moon failed'))
    await expect(a).rejects.toThrow('moon failed')
    await expect(b).rejects.toThrow('moon failed')
    expect(share.waiting('k')).toBe(0)
    expect(share.cached('k')).toBeNull()
    await expect(share.fresh('k', probe, { join: true })).resolves.toEqual(body('second'))
    expect(probes).toBe(2)
  })

  test('a waiter that leaves does not stop the probe for the others; the last one does', async () => {
    const share = createCatalogShare()
    share.activate()
    const gate = held()
    let seen: AbortSignal | undefined
    const probe = (signal: AbortSignal): Promise<CatalogBody> => {
      seen = signal
      return gate.promise
    }
    const tabA = new AbortController()
    const tabB = new AbortController()
    const a = share.fresh('k', probe, { join: true, signal: tabA.signal })
    const b = share.fresh('k', probe, { join: true, signal: tabB.signal })
    await vi.waitFor(() => expect(seen).toBeDefined())
    tabA.abort(new Error('tab closed'))
    await expect(a).rejects.toThrow('tab closed')
    expect(seen!.aborted).toBe(false)
    gate.resolve(body('one'))
    await expect(b).resolves.toEqual(body('one'))

    const gate2 = held()
    let seen2: AbortSignal | undefined
    const c = share.fresh(
      'k',
      (signal) => {
        seen2 = signal
        return gate2.promise
      },
      { join: false, signal: tabB.signal },
    )
    await vi.waitFor(() => expect(seen2).toBeDefined())
    tabB.abort(new Error('tab closed'))
    await expect(c).rejects.toThrow('tab closed')
    expect(seen2!.aborted).toBe(true)
  })

  test('a refresh does not join a probe that began earlier, and an older probe never replaces a newer answer', async () => {
    const share = createCatalogShare()
    share.activate()
    const older = held()
    const poll = share.fresh('k', () => older.promise, { join: true })
    // The user edits a file, then clicks Refresh.
    let probes = 0
    const refresh = share.fresh(
      'k',
      () => {
        probes++
        return Promise.resolve(body('after the edit'))
      },
      { join: false },
    )
    await expect(refresh).resolves.toEqual(body('after the edit'))
    expect(probes).toBe(1)
    older.resolve(body('before the edit'))
    await expect(poll).resolves.toEqual(body('before the edit'))
    expect(share.cached('k')).toMatchObject({ generatedAt: 'after the edit' })
  })

  test('stop aborts a running shared probe', async () => {
    const share = createCatalogShare()
    share.activate()
    let seen: AbortSignal | undefined
    const run = share.fresh(
      'k',
      (signal) => {
        seen = signal
        return new Promise<CatalogBody>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason))
        })
      },
      { join: true, signal: share.signal },
    )
    await vi.waitFor(() => expect(seen).toBeDefined())
    share.stop()
    expect(seen!.aborted).toBe(true)
    await expect(run).rejects.toThrow()
    expect(share.active).toBe(false)
  })

  test('a malformed saved view does not stop serve from starting; its probe answers', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ name: 'p', scripts: { build: 'echo b' } }),
    })
    const home = await root()
    const env = { HOME: home, PATH: process.env['PATH'] }
    const { app, share } = createWayApp({ home })
    const session = await createSession({ dir, cwd: dir, env, home })
    await session.catalog()
    expect(await session.savedCatalog()).not.toBeNull()
    const file = viewPath(session.store, session.root, session.viewKey())
    await writeFile(file, JSON.stringify({ version: 1, key: session.viewKey(), cache: 3 }), 'utf-8')

    const aborter = new AbortController()
    let out = ''
    const finished = serve({
      session,
      app,
      share,
      globals: {},
      cwd: dir,
      open: false,
      signal: aborter.signal,
      stdout: (text) => {
        out += text
      },
      stderr: () => {},
    })
    await vi.waitFor(() => expect(out).toMatch(/\?boot=[0-9a-f]+/))
    expect(out).not.toContain('the last listing')
    expect(out).toContain('nothing yet; the page shows each runner as it answers')
    await vi.waitFor(() => expect(share.cached(session.viewKey())).not.toBeNull())
    aborter.abort(130)
    expect(await finished).toBeNull()
  })

  test('a request under other trust or settings does not get the held catalog', () => {
    const share = createCatalogShare()
    share.activate()
    share.remember('a', { generatedAt: 't' } as never)
    expect(share.cached('a')).toMatchObject({ source: 'cached', storedAt: 't' })
    expect(share.cached('b')).toBeNull()
  })
})

describe('a new sign-in link', () => {
  const postSession = (address: string, body: unknown): Promise<Response> =>
    fetch(`${address}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  test('Enter in the terminal prints a new link, and stops being read once the server stops', async () => {
    const dir = await root({ 'package.json': JSON.stringify({ name: 'p', scripts: {} }) })
    const home = await root()
    const env = { HOME: home, PATH: process.env['PATH'] }
    const { app } = createWayApp({ home })
    const session = await createSession({ dir, cwd: dir, env, home })
    const aborter = new AbortController()
    const input = new PassThrough()
    let out = ''
    const finished = serve({
      session,
      app,
      globals: {},
      cwd: dir,
      open: false,
      input,
      foreground: async () => true,
      jobSignals: null,
      signal: aborter.signal,
      stdout: (text) => {
        out += text
      },
      stderr: () => {},
    })
    const links = (): string[] => [...out.matchAll(/\?boot=([0-9a-f]+)/g)].map((m) => m[1]!)
    await vi.waitFor(() => expect(links()).toHaveLength(1))
    expect(out).toContain('press Enter here for a new sign-in link')
    const address = out.match(/(http:\/\/127\.0\.0\.1:\d+)/)![1]!
    input.write('\n')
    await vi.waitFor(() => expect(links()).toHaveLength(2))
    const [first, second] = links()
    expect(second).not.toBe(first)
    expect((await postSession(address, { boot: first })).status).toBe(401)
    expect((await postSession(address, { boot: second })).status).toBe(200)
    aborter.abort(130)
    expect(await finished).toBeNull()
    expect(input.listenerCount('data')).toBe(0)
  })
  test('in the background the terminal is not read, so SIGTTIN cannot stop the server', async () => {
    const dir = await root({ 'package.json': JSON.stringify({ name: 'p', scripts: {} }) })
    const home = await root()
    const env = { HOME: home, PATH: process.env['PATH'] }
    const { app } = createWayApp({ home })
    const session = await createSession({ dir, cwd: dir, env, home })
    const aborter = new AbortController()
    const input = new PassThrough()
    let out = ''
    const finished = serve({
      session,
      app,
      globals: {},
      cwd: dir,
      open: false,
      input,
      foreground: async () => false,
      jobSignals: null,
      signal: aborter.signal,
      stdout: (text) => {
        out += text
      },
      stderr: () => {},
    })
    await vi.waitFor(() => expect(out).toContain('?boot='))
    expect(out).not.toContain('press Enter')
    expect(input.listenerCount('data')).toBe(0)
    const address = out.match(/(http:\/\/127\.0\.0\.1:\d+)/)![1]!
    expect((await fetch(`${address}/`)).status).toBe(200)
    aborter.abort(130)
    expect(await finished).toBeNull()
  })
})

describe('abortOnSignals', () => {
  /** The listener `abortOnSignals` added for `name`, called without signalling the process. */
  function added(name: 'SIGINT' | 'SIGTERM', before: readonly unknown[]): () => void {
    const fresh = process.listeners(name).filter((l) => !before.includes(l))
    expect(fresh).toHaveLength(1)
    return fresh[0] as () => void
  }

  test.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const)('%s aborts with exit code %i, and dispose removes the listener', (name, code) => {
    const before = process.listeners(name)
    const stopper = abortOnSignals(new AbortController().signal)
    added(name, before)()
    expect(stopper.signal.aborted).toBe(true)
    expect(stopper.signal.reason).toBe(code)
    stopper.dispose()
    expect(process.listeners(name)).toEqual(before)
  })

  test('the parent aborting aborts it with the same reason', () => {
    const parent = new AbortController()
    const stopper = abortOnSignals(parent.signal)
    parent.abort('done')
    expect(stopper.signal.reason).toBe('done')
    stopper.dispose()
  })
})
