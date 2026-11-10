import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

import { semverOrder } from '../alpha/load.ts'
import {
  compareScopes,
  compareSemver,
  inRange,
  isCalendarDate,
  validVersion,
  type Versioning,
} from './versions.ts'

describe('validVersion', () => {
  test('accepts semver as the spec spells it', () => {
    for (const v of [
      '0.0.0',
      '1.2.3',
      '1.0.0-rc.1',
      '1.0.0-0',
      '1.0.0-x-y.7',
      '1.0.0+build.5',
      '1.0.0-a+b',
    ])
      assert.ok(validVersion(v, 'semver'), v)
  })
  test('refuses leading zeros and empty identifiers', () => {
    for (const v of [
      '01.0.0',
      '1.02.3',
      '1.0.0-01',
      '1.0.0-',
      '1.0.0-a..b',
      '1.0.0-a.',
      '1.0.0+',
      '1.0',
      'v1.0.0',
    ])
      assert.ok(!validVersion(v, 'semver'), v)
  })
  test('dates must be real calendar dates', () => {
    assert.ok(validVersion('2024-02-29', 'date'))
    for (const v of ['2026-13-45', '2026-02-30', '2023-02-29', '2026-99-99', '2026-1-1'])
      assert.ok(!validVersion(v, 'date'), v)
    assert.ok(isCalendarDate('2000-12-31'))
  })
  test('unknown versioning allows no version', () => {
    assert.ok(!validVersion('1.0.0', 'unknown'))
  })
})

describe('compareSemver', () => {
  test('numeric identifiers past 2^53 stay exact', () => {
    assert.equal(compareSemver('1.0.0-9007199254740992', '1.0.0-9007199254740993'), -1)
    assert.equal(compareSemver('9007199254740993.0.0', '9007199254740992.0.0'), 1)
    assert.ok(
      !inRange(
        '1.0.0-9007199254740992',
        { since: null, until: '1.0.0-9007199254740992' },
        'semver',
      ),
    )
    assert.ok(
      inRange('1.0.0-9007199254740992', { since: null, until: '1.0.0-9007199254740993' }, 'semver'),
    )
  })
  test('follows precedence and ignores build metadata', () => {
    assert.equal(compareSemver('1.0.0+a', '1.0.0+b'), 0)
    assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1)
    assert.equal(compareSemver('1.2.3', '1.10.0'), -1)
  })
  test('the alpha loader uses the same comparator', () => {
    assert.equal(semverOrder('1.0.0-9007199254740992', '1.0.0-9007199254740993'), -1)
  })
})

test('compareScopes orders no limit first, then by since, then model', () => {
  const s = (since: string | null, model: string | null = null) => ({ since, model })
  assert.equal(compareScopes(s(null), s('1.0.0'), 'semver'), -1)
  assert.equal(compareScopes(s('1.10.0'), s('1.9.0'), 'semver'), 1)
  assert.equal(compareScopes(s('1.0.0', 'a'), s('1.0.0', 'b'), 'semver'), -1)
  assert.equal(compareScopes(s('1.0.0'), s('1.0.0'), 'semver'), 0)
})

describe('shared version cases', () => {
  const cases = JSON.parse(
    readFileSync(new URL('./version-cases.json', import.meta.url), 'utf8'),
  ) as {
    valid: [Versioning, string, boolean][]
    semverOrder: [string, string, number][]
  }
  test('validity', () => {
    for (const [versioning, v, ok] of cases.valid)
      assert.equal(validVersion(v, versioning), ok, `${versioning} ${v}`)
  })
  test('semver order', () => {
    for (const [a, b, o] of cases.semverOrder) assert.equal(compareSemver(a, b), o, `${a} ${b}`)
  })
})
