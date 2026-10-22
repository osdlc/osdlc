import { describe, expect, test } from 'vitest'

import { code, list, maxWords, table } from '../../src/core/leaves.js'

// leaves.ts builds a LeafSpec for each content kind: the `kind` drives the structure
// plane's kind-gate, and `config` is stashed for the content plane to validate. Each case
// shows the kind a builder declares and the config it carries.

describe('content-leaf builders → LeafSpec { kind, config }', () => {
  test('table(...) declares the `table` kind and carries its column config', () => {
    const leaf = table({ columns: ['File', 'Kind'], minRows: 1 })
    expect(leaf.kind).toBe('table')
    expect(leaf.config).toEqual({ columns: ['File', 'Kind'], minRows: 1 })
  })

  test('list(...) declares the `list` kind', () => {
    const leaf = list({ everyItem: 'checkbox', minItems: 2 })
    expect(leaf.kind).toBe('list')
    expect(leaf.config).toEqual({ everyItem: 'checkbox', minItems: 2 })
  })

  test('code(...) declares the `code` kind', () => {
    const leaf = code({ lang: 'ts' })
    expect(leaf.kind).toBe('code')
    expect(leaf.config).toEqual({ lang: 'ts' })
  })

  test('maxWords(n) declares the `paragraph` kind — a maxWords leaf gates to a paragraph', () => {
    const leaf = maxWords(120)
    expect(leaf.kind).toBe('paragraph')
    expect(leaf.config).toEqual({ maxWords: 120 })
  })
})
