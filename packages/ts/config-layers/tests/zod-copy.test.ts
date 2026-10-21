/**
 * A schema built by another copy of zod. The README says the schema walk
 * reads zod's `_def` tags rather than `instanceof`, so a second copy in a
 * consumer's tree still works. This test makes a real second copy: it copies
 * the zod package to a scratch directory and imports it from there, so its
 * classes are not the ones the package imports.
 */

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterAll, beforeAll, expect, test } from 'vitest'
import { z } from 'zod'

import { assembleConfig } from '../loader.ts'
import { defineConfigSection } from '../section.ts'
import { keyDescription, keyExists, leafSchema } from '../schema.ts'

import { META } from './support.ts'

let scratch: string
let z2: typeof z

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'config-layers-zod-copy-'))
  const original = dirname(fileURLToPath(import.meta.resolve('zod')))
  cpSync(original, join(scratch, 'zod'), { recursive: true })
  z2 = (await import(pathToFileURL(join(scratch, 'zod', 'index.js')).href)) as typeof z
})
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

test('the second copy is a different module instance of zod', () => {
  expect(z2.string).not.toBe(z.string)
  expect(z2.ZodString).not.toBe(z.ZodString)
})

test('keys, leaves and descriptions resolve through the second copy', () => {
  const schema = z2.object({
    endpoint: z2.string().default('').describe('The server.'),
    limits: z2.object({ max: z2.number().optional() }).prefault({}),
    paths: z2.record(z2.string(), z2.string()).default({}),
  })
  expect(keyExists(schema as never, 'limits.max')).toBe(true)
  expect(keyExists(schema as never, 'limits.nope')).toBe(false)
  expect(keyExists(schema as never, 'paths.dev')).toBe(true)
  expect(leafSchema(schema as never, 'endpoint')).not.toBeNull()
  expect(keyDescription(schema as never, 'endpoint')).toBe('The server.')
})

test('a config file loads through a section built by the second copy', () => {
  const section = defineConfigSection({
    key: 'upload',
    schema: z2
      .object({ endpoint: z2.string().default('none') })
      .strict()
      .prefault({}) as never,
    meta: META,
  })
  const root = join(scratch, 'project')
  mkdirSync(root)
  writeFileSync(join(root, 'tooly.yaml'), 'upload:\n  endpoint: https://example.com\n')
  const handle = assembleConfig({
    file: { name: 'tooly.yaml', envVar: 'TOOLY_CONFIG' },
    sections: [section],
    unknownTopLevel: 'reject',
    resolve: { env: {}, cwd: root },
  })
  expect((handle.load(root) as { upload: { endpoint: string } }).upload.endpoint).toBe(
    'https://example.com',
  )
})
