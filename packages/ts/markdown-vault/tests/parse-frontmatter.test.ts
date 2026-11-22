import assert from 'node:assert/strict'
import { test } from 'vitest'

import { parseFrontmatter } from '../src/scan.ts'

test('parseFrontmatter: reads a mapping between the fences', () => {
  assert.deepEqual(parseFrontmatter('---\ntitle: T\nn: 2\n---\nbody\n'), { title: 'T', n: 2 })
})

test('parseFrontmatter: a note with no frontmatter gives {}', () => {
  assert.deepEqual(parseFrontmatter('just a body\n'), {})
  assert.deepEqual(parseFrontmatter(''), {})
})

test('parseFrontmatter: malformed YAML gives {} instead of throwing', () => {
  assert.deepEqual(parseFrontmatter('---\nkey: [unclosed\n---\nbody\n'), {})
})

test('parseFrontmatter: a list or a scalar is not a mapping and gives {}', () => {
  assert.deepEqual(parseFrontmatter('---\n- a\n- b\n---\n'), {})
  assert.deepEqual(parseFrontmatter('---\njust text\n---\n'), {})
  assert.deepEqual(parseFrontmatter('---\n---\n'), {})
})

test('parseFrontmatter: accepts a byte-order mark, padded fences and leading blank lines', () => {
  assert.deepEqual(parseFrontmatter('﻿---\na: 1\n---\n'), { a: 1 })
  assert.deepEqual(parseFrontmatter('---  \na: 1\n---  \nbody\n'), { a: 1 })
  assert.deepEqual(parseFrontmatter('\n\n---\na: 1\n---\n'), { a: 1 })
})

test('parseFrontmatter: accepts CRLF line endings', () => {
  assert.deepEqual(parseFrontmatter('---\r\na: 1\r\n---\r\nbody\r\n'), { a: 1 })
})
