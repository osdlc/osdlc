import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Ajv2020 } from 'ajv/dist/2020.js'
import { expect, test } from 'vitest'

import { loadKnowledge, lookup } from '../src/index.js'

const DATA = join(import.meta.dirname, '..', 'data')
const read = (name: string): unknown => JSON.parse(readFileSync(join(DATA, name), 'utf-8'))

test('the data file validates against the schema beside it', () => {
  const validate = new Ajv2020({ strict: false }).compile(
    read('harness-knowledge.schema.json') as object,
  )
  const ok = validate(read('harness-knowledge.json'))
  expect(validate.errors ?? []).toEqual([])
  expect(ok).toBe(true)
})

test('every value names a known harness and subject and carries a basis link', () => {
  const k = loadKnowledge()
  for (const v of k.values) {
    expect(k.harnesses[v.harness], `${v.harness} ${v.subject}`).toBeDefined()
    expect(k.subjects[v.subject], `${v.harness} ${v.subject}`).toBeDefined()
    expect(v.basis, `${v.harness} ${v.subject}`).toMatch(/^https:\/\/github\.com\//)
  }
})

test('every value in the file is found by lookup without throwing', () => {
  const k = loadKnowledge()
  for (const v of k.values) {
    expect(() =>
      lookup(k, v.harness, v.subject, { accept: { weak: true, disputed: true } }),
    ).not.toThrow()
  }
})
