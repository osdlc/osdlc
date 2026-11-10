import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test } from 'vitest'

import { loadConfig, OSDLC, readConfig } from '@osdlc/package-checks'

test('no settings file gives osdlc rules', () => {
  assert.deepEqual(readConfig(undefined), OSDLC)
})

test('a settings file overrides only the keys it names', () => {
  const c = readConfig({ configPackages: ['tsconfig'], author: null, scope: '@acme' })
  assert.deepEqual(c.configPackages, ['tsconfig'])
  assert.equal(c.author, null)
  assert.equal(c.scope, '@acme')
  assert.equal(c.license, OSDLC.license)
})

test('unknown keys and wrong types are refused, each named', () => {
  assert.throws(
    () => readConfig({ licence: 'MIT', catalog: 'yes' }),
    (e: Error) => {
      assert.equal(
        e.message,
        'package-checks.json: unknown key licence\npackage-checks.json: catalog has the wrong type',
      )
      return true
    },
  )
  assert.throws(() => readConfig({ shared: ['('] }), /shared has the wrong type/)
  assert.throws(() => readConfig({ scope: 'osdlc' }), /scope has the wrong type/)
  assert.throws(() => readConfig([]), /is not an object/)
})

test('a key named after an Object.prototype member is unknown', () => {
  for (const key of ['toString', 'constructor', '__proto__']) {
    const raw = JSON.parse(`{"${key}": {}}`) as unknown
    assert.throws(() => readConfig(raw), new RegExp(`unknown key ${key}$`))
  }
})

test('loadConfig reads package-checks.json at the root', () => {
  const root = mkdtempSync(join(tmpdir(), 'package-checks-config-'))
  try {
    assert.deepEqual(loadConfig(root), OSDLC)
    writeFileSync(join(root, 'package-checks.json'), JSON.stringify({ tsDir: 'libs' }))
    assert.equal(loadConfig(root).tsDir, 'libs')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
