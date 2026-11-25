/**
 * The README's examples, run through the package name: a plugin's own
 * candidate goes through survey, plan and clean, and the receipt keeps its
 * result sentence; the Descriptors section's file reads back, and a bad one
 * names its problems.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  DescriptorError,
  clean,
  plan,
  readDescriptor,
  survey,
  type Plugin,
  type RunCtx,
} from '@osdlc/host-cleaner'

// A path candidate must sit inside a target, or inside the plugin's roots.
const dir = join(process.cwd(), 'build-cache')

const cache: Plugin = {
  name: 'cache',
  detect: () => true,
  discover: () => [
    {
      id: `artifact:${dir}`,
      kind: 'artifact',
      path: dir,
      owner: 'cache',
      why: 'idle for a week',
      evidence: { bytes: 4096 },
    },
  ],
  delete: (c) => `removed ${c.path}`,
}

test("a plugin's candidate goes through survey, plan and clean", async () => {
  const ctx: RunCtx = { cwd: process.cwd(), targets: [process.cwd()], allow: [] }
  const receipt = await clean(plan(await survey([cache], ctx)), [cache], ctx)
  expect(receipt.status).toBe('complete')
  expect(receipt.steps).toMatchObject([
    { id: `artifact:${dir}`, owner: 'cache', result: 'ok', delete: `removed ${dir}` },
  ])
})

test("the README's descriptor reads back, and a bad one lists its problems", () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const yaml = /### Descriptors[\s\S]*?```yaml\n([\s\S]*?)```/.exec(readme)?.[1]
  expect(yaml).toBeDefined()
  const folder = mkdtempSync(join(tmpdir(), 'hc-readme-'))
  try {
    const file = join(folder, 'uv.yaml')
    writeFileSync(file, yaml!)
    expect(readDescriptor(file)).toMatchObject({
      descriptor: 1,
      paths: { cache: { all: '~/.cache/uv' } },
      candidates: [{ path: 'cache', removes: 'unused' }],
    })

    writeFileSync(file, yaml!.replace('- path: cache', '- path: models'))
    let issues: readonly string[] = []
    try {
      readDescriptor(file)
    } catch (err) {
      if (err instanceof DescriptorError) issues = err.issues
    }
    expect(issues).toEqual(['line 8: candidates.0.path: no folder named "models" in paths'])
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})
