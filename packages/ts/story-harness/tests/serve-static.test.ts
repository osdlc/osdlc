import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { get } from 'node:http'
import { createServer } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { serveStatic } from '../src/runner/serve-static.ts'

let root: string
let sb: string
let close: (() => void) | undefined

/** Ask the OS for a free port. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number }
      srv.close(() => resolve(port))
    })
  })
}

/** A raw GET: `path` is sent as written, with no client-side normalisation. */
function fetchRaw(host: string, port: number, path: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    get({ host, port, path }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    }).on('error', reject)
  })
}

async function serve(dir: string) {
  const port = await freePort()
  close = await serveStatic(dir, port)
  return port
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'serve-static-'))
  sb = join(root, 'storybook-static')
  await mkdir(sb)
  await writeFile(join(sb, 'index.html'), 'storybook index')
  await writeFile(join(sb, 'app.js'), 'console.log(1)')
  await writeFile(join(root, 'secret.txt'), 'top secret')
})
afterEach(() => {
  close?.()
  close = undefined
})
afterAll(() => rm(root, { recursive: true, force: true }))

const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((a) => a && a.family === 'IPv4' && !a.internal)?.address

describe('serveStatic', () => {
  it('serves a file of the build with its MIME type', async () => {
    const port = await serve(sb)
    expect(await fetchRaw('127.0.0.1', port, '/app.js')).toEqual({
      status: 200,
      body: 'console.log(1)',
    })
  })

  it('never serves a file outside the directory through an encoded ../', async () => {
    const port = await serve(sb)
    for (const path of ['/..%2fsecret.txt', '/%2e%2e%2fsecret.txt', '/..%5csecret.txt']) {
      const res = await fetchRaw('127.0.0.1', port, path)
      expect(res.body, path).not.toContain('top secret')
    }
  })

  it('answers 404, and keeps serving, when the directory has no index.html', async () => {
    const empty = await mkdtemp(join(root, 'empty-'))
    await writeFile(join(empty, 'index.json'), '{}')
    const port = await serve(empty)
    expect((await fetchRaw('127.0.0.1', port, '/missing.js')).status).toBe(404)
    expect(await fetchRaw('127.0.0.1', port, '/index.json')).toEqual({ status: 200, body: '{}' })
  })

  it('rejects, and does not crash the process, when the port is taken', async () => {
    const port = await serve(sb)
    await expect(serveStatic(sb, port)).rejects.toThrow(/EADDRINUSE/)
  })

  it('serves wasm as application/wasm, whatever the extension case', async () => {
    await writeFile(join(sb, 'mod.WASM'), 'wasm')
    const port = await serve(sb)
    const type = await new Promise<string | undefined>((resolve, reject) => {
      get({ host: '127.0.0.1', port, path: '/mod.WASM' }, (res) => {
        res.resume()
        resolve(res.headers['content-type'])
      }).on('error', reject)
    })
    expect(type).toBe('application/wasm')
  })

  it.skipIf(!lanAddress)('listens on loopback only', async () => {
    const port = await serve(sb)
    await expect(fetchRaw(lanAddress!, port, '/app.js')).rejects.toThrow(/ECONNREFUSED/)
  })
})
