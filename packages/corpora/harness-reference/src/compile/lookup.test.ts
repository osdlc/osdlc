import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { type Knowledge, type KnowledgeValue, type Scope } from './knowledge.ts'
import { AmbiguousValue, lookup } from './lookup.ts'

const scope = (over: Partial<Scope> = {}): Scope => ({
  since: null,
  until: null,
  platform: [],
  model: null,
  ...over,
})
const val = (
  value: unknown,
  s: Partial<Scope> = {},
  over: Partial<KnowledgeValue> = {},
): KnowledgeValue => ({
  harness: 'h',
  subject: 'c/s',
  value,
  scope: scope(s),
  strength: 'strong',
  basis: `https://github.com/x/y/blob/sha/${JSON.stringify(value)}`,
  ...over,
})
const k = (
  values: KnowledgeValue[],
  versioning: 'semver' | 'date' | 'unknown' = 'semver',
): Knowledge => ({
  schema: 1,
  corpus: { repo: 'x/y', path: 'p', commit: 'sha' },
  harnesses: { h: { title: 'H', versioning } },
  subjects: {},
  values,
})
const pick = (kn: Knowledge, q = {}): unknown => lookup(kn, 'h', 'c/s', q)?.value

describe('lookup versions', () => {
  const kn = k([val('old', { until: '2.0.0' }), val('new', { since: '2.0.0' })])
  test('since is inclusive and until is exclusive', () => {
    assert.equal(pick(kn, { version: '1.9.9' }), 'old')
    assert.equal(pick(kn, { version: '2.0.0' }), 'new')
    assert.equal(pick(kn, { version: '10.0.0' }), 'new')
  })
  test('semver compares numbers and prereleases, not strings', () => {
    assert.equal(pick(kn, { version: '2.0.0-rc.1' }), 'old')
    assert.equal(pick(k([val('a', { since: '1.9.0' })]), { version: '1.10.0' }), 'a')
    assert.equal(pick(k([val('a', { until: '1.10.0' })]), { version: '1.9.0' }), 'a')
  })
  test('with no version only open-ended values count', () => {
    assert.equal(pick(kn), 'new')
    assert.equal(pick(k([val('old', { until: '2.0.0' })])), undefined)
  })
  test('dates compare as strings', () => {
    const d = k([val('a', { until: '2026-03-01' }), val('b', { since: '2026-03-01' })], 'date')
    assert.equal(pick(d, { version: '2026-02-28' }), 'a')
    assert.equal(pick(d, { version: '2026-03-01' }), 'b')
  })
  test('a value with no limits fits every version, and unknown versioning ignores the version', () => {
    assert.equal(pick(k([val('any')]), { version: '3.1.4' }), 'any')
    assert.equal(pick(k([val('any')], 'unknown'), { version: 'whatever' }), 'any')
  })
  test('nothing for another harness or subject', () => {
    assert.equal(lookup(kn, 'other', 'c/s'), undefined)
    assert.equal(lookup(kn, 'h', 'c/other'), undefined)
  })
})

describe('lookup scope', () => {
  const kn = k([
    val('any'),
    val('mac', { platform: ['macos'] }),
    val('opus', { model: 'opus' }),
    val('mac opus', { platform: ['macos'], model: 'opus' }),
  ])
  test('the narrowest matching scope wins', () => {
    assert.equal(pick(kn, { platform: 'macos', model: 'opus' }), 'mac opus')
    assert.equal(pick(kn, { platform: 'macos' }), 'mac')
    assert.equal(pick(kn, { model: 'opus' }), 'opus')
    assert.equal(pick(kn, { platform: 'linux', model: 'haiku' }), 'any')
  })
  test('with no platform or model asked, the broad value wins', () => {
    assert.equal(pick(kn), 'any')
  })
  test('a specific value is used when it is the only one', () => {
    assert.equal(pick(k([val('mac', { platform: ['macos'] })])), 'mac')
    assert.equal(pick(k([val('mac', { platform: ['macos'] })]), { platform: 'linux' }), undefined)
  })
})

describe('lookup omitted dimensions', () => {
  test('a value broad on an omitted dimension beats a narrower one', () => {
    const kn = k([
      val('opus', { model: 'opus' }),
      val('mac opus', { platform: ['macos'], model: 'opus' }),
    ])
    assert.equal(pick(kn), 'opus')
    assert.equal(pick(kn, { model: 'opus' }), 'opus')
    assert.equal(pick(kn, { model: 'opus', platform: 'macos' }), 'mac opus')
  })
  test('mixed partial scopes: omitted dimensions are ranked apart from supplied ones', () => {
    const kn = k([
      val('mac', { platform: ['macos'] }),
      val('opus', { model: 'opus' }),
      val('mac opus', { platform: ['macos'], model: 'opus' }),
    ])
    // Platform asked, model not: the platform-only value is broad on model.
    assert.equal(pick(kn, { platform: 'macos' }), 'mac')
    // Model asked, platform not: the model-only value is broad on platform.
    assert.equal(pick(kn, { model: 'opus' }), 'opus')
    // Neither asked: one narrow on a single dimension beats one narrow on two.
    const both = k([
      val('mac', { platform: ['macos'] }),
      val('mac opus', { platform: ['macos'], model: 'opus' }),
    ])
    assert.equal(pick(both), 'mac')
  })
})

describe('lookup version validation', () => {
  test('a malformed version throws instead of matching everything', () => {
    const kn = k([val('a', { until: '2.0.0' })])
    assert.throws(() => lookup(kn, 'h', 'c/s', { version: 'garbage' }), /not a semver version/)
    assert.throws(() => lookup(kn, 'h', 'c/s', { version: '1.0.0-01' }), /not a semver version/)
    assert.throws(
      () => lookup(k([val('a')], 'date'), 'h', 'c/s', { version: '2026-02-30' }),
      /not a date version/,
    )
  })
})

describe('lookup strength and ambiguity', () => {
  test('weak and disputed values need accept', () => {
    const weak = k([val('w', {}, { strength: 'weak' })])
    assert.equal(lookup(weak, 'h', 'c/s'), undefined)
    assert.equal(lookup(weak, 'h', 'c/s', { accept: { weak: true } })?.strength, 'weak')
    const disputed = k([val('d', {}, { disputed: true })])
    assert.equal(lookup(disputed, 'h', 'c/s'), undefined)
    const found = lookup(disputed, 'h', 'c/s', { accept: { disputed: true } })
    assert.equal(found?.disputed, true)
  })
  test('returns the value, strength, basis and disputed flag', () => {
    const found = lookup(k([val({ a: 1 })]), 'h', 'c/s')
    assert.deepEqual(found, {
      value: { a: 1 },
      strength: 'strong',
      basis: 'https://github.com/x/y/blob/sha/{"a":1}',
      disputed: false,
    })
  })
  test('an undisputed value beats a disputed one of the same scope', () => {
    const kn = k([val('d', {}, { disputed: true }), val('ok')])
    assert.equal(pick(kn, { accept: { disputed: true } }), 'ok')
  })
  test('two equally narrow values throw AmbiguousValue', () => {
    const kn = k([val('a'), val('b')])
    assert.throws(
      () => lookup(kn, 'h', 'c/s'),
      (e: unknown) => e instanceof AmbiguousValue && e.candidates.length === 2,
    )
  })
})
