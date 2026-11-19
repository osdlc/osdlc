/**
 * A walk that hits system-model's directory-walk cap must not return a partial
 * manifest list as if it were complete. The Rust peer (`walk.rs`) has no cap,
 * so a capped result has no parity answer: the walk fails instead.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import { walkManifests } from '../src/manifest-walk.ts'

let made = ''
afterAll(() => rmSync(made, { recursive: true, force: true }))

test('a walk cut short by the depth cap throws instead of dropping manifests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'manifest-graph-walk-limit-'))
  made = root
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'top' }))
  // Deeper than system-model's MAX_WALK_DEPTH (32), so the walk never reaches it.
  const deep = join(root, ...Array.from({ length: 40 }, (_, i) => `d${i}`))
  mkdirSync(deep, { recursive: true })
  writeFileSync(join(deep, 'package.json'), JSON.stringify({ name: 'deep' }))

  await expect(walkManifests(root)).rejects.toThrow(/directory walk/)
})
