import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkSchema, load } from './validate.ts'

const VALID = `---
name: Example
vendor: Example Inc.
homepage: "https://example.com"
docs: "https://example.com/docs"
open_source: false
cli: example
surfaces: [cli]
status: current
versioning: semver
checked: "2026-11-05"
sources:
  - url: "https://example.com/docs"
    title: Example docs
---

Example is a coding agent.
`

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-reference-beta-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const write = (id: string, text: string): void => writeFileSync(join(dir, `${id}.md`), text)
const has = (errors: string[], part: string): boolean => errors.some((e) => e.includes(part))

describe('the beta corpus', () => {
  test('validate', () => {
    const { harnesses, errors } = load()
    assert.deepEqual(errors, [])
    assert.ok(harnesses.size > 0)
  })

  test('schema/beta/harness.schema.json matches src/beta/schema.ts', () => {
    assert.deepEqual(checkSchema(), [])
  })
})

describe('load', () => {
  test('a valid entry passes', () => {
    write('example', VALID)
    const { harnesses, errors } = load(dir)
    assert.deepEqual(errors, [])
    assert.equal(harnesses.get('example')?.name, 'Example')
  })

  test('an unknown field fails', () => {
    write('example', VALID.replace('status:', 'colour: blue\nstatus:'))
    assert.ok(has(load(dir).errors, 'colour'))
  })

  test('a dangling successor fails', () => {
    write('example', VALID.replace('status:', 'successor: missing\nstatus:'))
    assert.ok(has(load(dir).errors, 'successor "missing" is not a harness'))
  })

  test('a successor that exists passes', () => {
    write('example', VALID.replace('status:', 'successor: newer\nstatus:'))
    write('newer', VALID)
    assert.deepEqual(load(dir).errors, [])
  })

  test('an empty body fails', () => {
    write('example', VALID.replace('Example is a coding agent.\n', ''))
    assert.ok(has(load(dir).errors, 'body is empty'))
  })

  test('a bad filename fails', () => {
    write('Example', VALID)
    assert.ok(has(load(dir).errors, 'filename'))
  })
})

describe('checkSchema', () => {
  test('detects a stale schema file', () => {
    const path = join(dir, 'harness.schema.json')
    writeFileSync(path, '{"type": "object"}\n')
    assert.ok(has(checkSchema(path), 'stale'))
    checkSchema(path, true)
    assert.deepEqual(checkSchema(path), [])
  })
})
