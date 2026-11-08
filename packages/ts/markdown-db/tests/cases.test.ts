import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { validateCorpus } from '../src/index.ts'

const CASES = join(import.meta.dirname, 'cases')

// S-markdown-db fixes the `<file>: <field>` prefix of a problem, not its message text or order.
const prefix = (line: string): string => line.split(': ', 2).join(': ')
const prefixes = (lines: string[]): string[] => [...new Set(lines.map(prefix))].sort()

describe('cases', () => {
  for (const name of readdirSync(CASES, { withFileTypes: true })) {
    if (!name.isDirectory()) continue
    test(name.name, () => {
      const dir = join(CASES, name.name)
      const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'))
      const { errors, warnings } = validateCorpus(join(dir, 'corpus'))
      assert.deepEqual(prefixes(errors), [...expected.errors].sort())
      assert.deepEqual(prefixes(warnings), [...expected.warnings].sort())
    })
  }
})
