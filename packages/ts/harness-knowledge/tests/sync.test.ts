import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { problems, syncFrom } from '../scripts/sync.ts'

const dirs: string[] = []
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'hk-sync-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

test('syncFrom copies both files unchanged', () => {
  const from = tmp()
  const to = tmp()
  writeFileSync(join(from, 'harness-knowledge.json'), '{"schema":1}\n')
  writeFileSync(join(from, 'harness-knowledge.schema.json'), '{}\n')
  syncFrom(from, to)
  expect(readFileSync(join(to, 'harness-knowledge.json'), 'utf-8')).toBe('{"schema":1}\n')
})

test('a missing file, bad JSON or another schema number is refused', () => {
  const from = tmp()
  expect(problems(from)).toHaveLength(2)
  writeFileSync(join(from, 'harness-knowledge.json'), '{"schema":2}')
  writeFileSync(join(from, 'harness-knowledge.schema.json'), 'nope')
  expect(problems(from)).toHaveLength(2)
  expect(() => syncFrom(from, tmp())).toThrow()
})
