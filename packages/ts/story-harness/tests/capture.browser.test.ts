import { mkdtemp, mkdir, readdir, rm, writeFile, readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { captureStories } from '../src/runner/capture.ts'
import { serveStatic } from '../src/runner/serve-static.ts'

// A tiny "built Storybook": an index.json plus an iframe.html that emits the
// events `preparePage`/`openStory` wait for and paints a fixed page.
const IFRAME = `<!doctype html><body style="margin:0"><div id="d" style="width:100vw;height:100vh;background:#abc">story</div><script>
document.getElementById("d").style.background = location.search.includes("theme:dark") ? "#123" : "#abc"
const q = new URLSearchParams(location.search)
const id = q.get('id')
const listeners = {}
window.__STORYBOOK_PREVIEW__ = {
  channel: { on: (n, f) => { (listeners[n] ||= []).push(f) } },
  get currentRender() { return { story: { parameters: { screenshot: window.__PARAMS__ ?? {} } } } },
}
window.__PARAMS__ = id.includes('narrowextra') ? { narrow: true, settleMs: 0 } : { settleMs: 0 }
setTimeout(() => (listeners.storyFinished ?? []).forEach((f) => f({ storyId: id, status: 'success' })), 10)
</script></body>`

let dir: string
let out: string
const outDirs: string[] = []

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
const ids = ['x--plain', 'x--thing-dark', 'x--thing-narrow', 'x--narrowextra']

async function run(extra: Record<string, unknown> = {}) {
  out = await mkdtemp(join(tmpdir(), 'shots-out-'))
  outDirs.push(out)
  const port = await freePort()
  const ok = await captureStories({ storybookDir: dir, prefix: 'x--', outDir: out, port, ...extra })
  return { ok, files: (await readdir(out, { recursive: true })).sort() }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'shots-sb-'))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'iframe.html'), IFRAME)
  await writeFile(
    join(dir, 'index.json'),
    JSON.stringify({ entries: Object.fromEntries(ids.map((id) => [id, { type: 'story' }])) }),
  )
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
  await Promise.all(outDirs.map((d) => rm(d, { recursive: true, force: true })))
})

describe('captureStories', () => {
  it('keeps the default file names, including --narrow for a narrow story', async () => {
    const { ok, files } = await run()
    expect(ok).toBe(true)
    expect(files).toEqual([
      'narrowextra--narrow.png',
      'narrowextra.png',
      'plain.png',
      'thing-dark.png',
      'thing-narrow.png',
    ])
  })

  it('keeps a -dark id dark under the default themes', async () => {
    await run({ contains: 'thing-dark' })
    const dark = await readFile(join(out, 'thing-dark.png'))
    const light = await run({ contains: 'plain' }).then(() => readFile(join(out, 'plain.png')))
    expect(dark.equals(light)).toBe(false)
  })

  it('shoots by default at 1440x900, -narrow ids at 1024x720, and viewport overrides both', async () => {
    const size = async (p: string) => {
      const b = await readFile(p)
      return [b.readUInt32BE(16), b.readUInt32BE(20)]
    }
    let r = await run({ contains: 'plain' })
    expect(await size(join(out, 'plain.png'))).toEqual([1440, 900])
    r = await run({ contains: 'thing-narrow' })
    expect(await size(join(out, 'thing-narrow.png'))).toEqual([1024, 720])
    r = await run({ contains: 'thing-narrow', viewport: { width: 1024, height: 768 } })
    expect(await size(join(out, 'thing-narrow.png'))).toEqual([1024, 768])
    expect(r.ok).toBe(true)
  })

  it('writes <name>--<theme>.png for every theme in the flat layout', async () => {
    const { ok, files } = await run({ contains: 'narrowextra', themes: ['light', 'dark'] })
    expect(ok).toBe(true)
    expect(files).toEqual([
      'narrowextra--dark--narrow.png',
      'narrowextra--dark.png',
      'narrowextra--light--narrow.png',
      'narrowextra--light.png',
    ])
  })

  it('closes the static server when the browser cannot start', async () => {
    const port = await freePort()
    const launch = vi.spyOn(chromium, 'launch').mockRejectedValueOnce(new Error('no browser'))
    try {
      await expect(
        captureStories({ storybookDir: dir, prefix: 'x--', outDir: dir, port }),
      ).rejects.toThrow('no browser')
    } finally {
      launch.mockRestore()
    }
    // The port is free again: the server was closed.
    const close = await serveStatic(dir, port)
    close()
  })

  it('writes <name>/<theme>.png for every theme in the by-theme layout', async () => {
    const { ok, files } = await run({
      contains: 'plain',
      themes: ['light', 'dark'],
      outLayout: 'by-theme',
    })
    expect(ok).toBe(true)
    expect(files).toEqual(['plain', 'plain/dark.png', 'plain/light.png'])
  })

  it('adds <theme>--narrow.png for a narrow story in the by-theme layout', async () => {
    const { ok, files } = await run({
      contains: 'narrowextra',
      themes: ['light', 'dark'],
      outLayout: 'by-theme',
    })
    expect(ok).toBe(true)
    expect(files).toEqual([
      'narrowextra',
      'narrowextra/dark--narrow.png',
      'narrowextra/dark.png',
      'narrowextra/light--narrow.png',
      'narrowextra/light.png',
    ])
  })

  it('leaves out the --narrow extra shot when a viewport is set', async () => {
    const { files } = await run({
      contains: 'narrowextra',
      themes: ['light', 'dark'],
      outLayout: 'by-theme',
      viewport: { width: 1024, height: 768 },
    })
    expect(files).toEqual(['narrowextra', 'narrowextra/dark.png', 'narrowextra/light.png'])
  })
})
