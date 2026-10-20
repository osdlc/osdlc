/**
 * The licence expression, the licence files and the README agree.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'bun:test'

const ROOT = join(import.meta.dir, '..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  license: string
  files: string[]
}

test('the package is MIT OR Apache-2.0 and ships both licence files', () => {
  expect(manifest.license).toBe('MIT OR Apache-2.0')
  expect(manifest.files).toContain('LICENSE-MIT')
  expect(manifest.files).toContain('LICENSE-APACHE')
  expect(manifest.files).not.toContain('LICENSE')
  expect(existsSync(join(ROOT, 'LICENSE'))).toBe(false)
  for (const file of ['LICENSE-MIT', 'LICENSE-APACHE']) {
    expect(readFileSync(join(ROOT, file), 'utf8')).toMatch(/Copyright (\(c\) )?2026 sksizer/)
  }
})

test('the README licence section names both', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  const section = readme.slice(readme.indexOf('## Licence'))
  expect(section).toContain('`MIT OR Apache-2.0`')
  expect(section).toContain('`LICENSE-MIT`')
  expect(section).toContain('`LICENSE-APACHE`')
})
