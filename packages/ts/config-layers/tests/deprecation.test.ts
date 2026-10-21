/**
 * A section whose meta carries `deprecation` loads and
 * warns once on stderr naming its replacement; an unknown key still refuses.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import { ConfigInvalidError } from '../src/config-error.ts'
import { deprecatedKeysSet, deprecationMessage } from '../src/deprecation.ts'
import { assembleConfig } from '../src/loader.ts'
import { ConfigKeyMetaSchema } from '../src/meta.ts'
import { defineConfigSection } from '../src/section.ts'

import { CONFIG_FILE, META } from './support.ts'

const DEPRECATED = { since: '1.2.0', removeIn: '2.0.0', use: 'paths.site' }

const old = defineConfigSection({
  key: 'docs_site',
  schema: z.string().default('site').describe('Where the site lives.'),
  meta: { ...META, deprecation: DEPRECATED },
})
const live = defineConfigSection({
  key: 'upload_endpoint',
  schema: z.string().default('').describe('The remote.'),
  meta: META,
})

const handle = assembleConfig({
  file: CONFIG_FILE,
  sections: [old, live],
  unknownTopLevel: 'reject',
  resolve: { env: {} },
})

let root: string
let stderr: string[]
let restore: () => void

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deprecation-'))
  stderr = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((t: string | Uint8Array) => {
    stderr.push(String(t))
    return true
  }) as typeof process.stderr.write)
  restore = () => spy.mockRestore()
  handle.clearCache()
})

afterEach(() => {
  restore()
  rmSync(root, { recursive: true, force: true })
})

describe('deprecated key', () => {
  test('loads normally and warns exactly once, naming the replacement', () => {
    writeFileSync(join(root, 'tooly.yaml'), 'docs_site: sites/docs\n')
    expect(handle.load(root).docs_site).toBe('sites/docs')
    // A reload of changed content must not repeat the warning for the same key.
    writeFileSync(join(root, 'tooly.yaml'), 'docs_site: sites/other\n')
    expect(handle.load(root).docs_site).toBe('sites/other')
    expect(stderr).toEqual([
      "warning: tooly.yaml key 'docs_site' is deprecated since 1.2.0 and will be removed in 2.0.0; use paths.site instead\n",
    ])
  })

  test('warns for a key set only in the overlay', () => {
    writeFileSync(join(root, 'tooly.local.yaml'), 'docs_site: sites/docs\n')
    handle.load(root)
    expect(stderr).toEqual([
      "warning: tooly.local.yaml key 'docs_site' is deprecated since 1.2.0 and will be removed in 2.0.0; use paths.site instead\n",
    ])
  })

  test('a key set in both files names the project file', () => {
    writeFileSync(join(root, 'tooly.yaml'), 'docs_site: a\n')
    writeFileSync(join(root, 'tooly.local.yaml'), 'docs_site: b\n')
    handle.load(root)
    expect(stderr).toHaveLength(1)
    expect(stderr[0]).toContain("tooly.yaml key 'docs_site'")
  })

  test('one handle warns once per project, not once overall', () => {
    const other = mkdtempSync(join(tmpdir(), 'deprecation-other-'))
    try {
      writeFileSync(join(root, 'tooly.yaml'), 'docs_site: a\n')
      writeFileSync(join(other, 'tooly.yaml'), 'docs_site: b\n')
      handle.load(root)
      handle.load(other)
      handle.load(root)
      expect(stderr).toHaveLength(2)
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  test('says nothing when the key is unset (its default is not a use)', () => {
    writeFileSync(join(root, 'tooly.yaml'), 'upload_endpoint: origin\n')
    handle.load(root)
    expect(stderr).toEqual([])
  })

  test('deprecatedKeysSet judges the raw layers, in section order', () => {
    expect(deprecatedKeysSet([old, live], [{ docs_site: 1, upload_endpoint: 1 }, null])).toEqual([
      { key: 'docs_site', deprecated: DEPRECATED, layer: 0 },
    ])
    expect(deprecatedKeysSet([old], [null, { docs_site: 1 }])).toEqual([
      { key: 'docs_site', deprecated: DEPRECATED, layer: 1 },
    ])
    expect(deprecatedKeysSet([old, live], [{ upload_endpoint: 1 }, null])).toEqual([])
  })

  test('the message omits the replacement when there is none', () => {
    expect(deprecationMessage('x', { since: '1', removeIn: '2' })).toBe(
      'warning: x is deprecated since 1 and will be removed in 2',
    )
  })
})

describe('unknown key', () => {
  test('still refuses to load, with no deprecation warning', () => {
    writeFileSync(join(root, 'tooly.yaml'), 'docs_site: x\nnot_a_key: 1\n')
    expect(() => handle.load(root)).toThrow(ConfigInvalidError)
    expect(() => handle.load(root)).toThrow(/not_a_key/)
    expect(stderr).toEqual([])
  })
})

describe('key meta', () => {
  test('accepts a deprecation and rejects a malformed or unknown-field one', () => {
    expect(ConfigKeyMetaSchema.safeParse({ ...META, deprecation: DEPRECATED }).success).toBe(true)
    expect(ConfigKeyMetaSchema.safeParse(META).success).toBe(true)
    expect(ConfigKeyMetaSchema.safeParse({ ...META, deprecation: { since: '1' } }).success).toBe(
      false,
    )
    expect(
      ConfigKeyMetaSchema.safeParse({ ...META, deprecation: { ...DEPRECATED, extra: 1 } }).success,
    ).toBe(false)
  })
})
