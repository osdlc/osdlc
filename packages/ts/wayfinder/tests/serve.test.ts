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
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { HttpApi } from '@osdlc/cli-tool/http'
import { resolveTrustRoot } from '@osdlc/trust-repo'

import { abortOnSignals } from '../src/commands/browse.ts'
import { createWayApp } from '../src/commands/index.ts'
import { createSession } from '../src/core/session.ts'
import { createSignIn } from '../src/serve/auth.ts'
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

  test('the boot token redeemed twice stops the server and says why', async () => {
    const s = await start()
    const first = await session(s.address, { boot: s.web.signIn.bootToken })
    expect(first.status).toBe(200)
    const again = await session(s.address, { boot: s.web.signIn.bootToken })
    expect(again.status).toBe(401)
    expect(await s.web.finished).toBe(1)
    expect(s.err.join('')).toContain('the sign-in link was used twice')
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
