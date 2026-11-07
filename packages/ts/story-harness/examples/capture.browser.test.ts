// Documentation shots: captureStories writes one PNG per story, with no
// comparison. A package script usually calls captureCli with its defaults:
//
//   await captureCli({ packageDir: import.meta.dirname + '/..', prefix: 'card--', out: 'docs/shots', port: 6107 })
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { captureCli, captureStories, type CaptureOptions } from '@osdlc/story-harness/runner'

/** A free port for the static server. */
const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })

const storybookDir = fileURLToPath(new URL('../tests/fixtures/storybook-static', import.meta.url))

test('captureStories shoots every story with a prefix, in both themes', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'capture-example-'))
  try {
    const options: CaptureOptions = {
      storybookDir,
      prefix: 'demo-card--',
      outDir,
      port: await freePort(),
      themes: ['light', 'dark'],
      outLayout: 'by-theme',
    }
    expect(await captureStories(options)).toBe(true)
    expect(readdirSync(outDir, { recursive: true }).sort()).toEqual([
      'plain',
      'plain/dark.png',
      'plain/light.png',
      'wide',
      'wide/dark.png',
      'wide/light.png',
    ])
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
  expect(captureCli).toBeTypeOf('function')
}, 60_000)
