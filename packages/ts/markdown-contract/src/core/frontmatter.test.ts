import { describe, expect, test } from 'vitest'

import { splitFrontmatter } from './frontmatter.js'
import { parse } from './projection.js'

// frontmatter.ts owns the pure frontmatter/body split: given a source string, you get back
// the fences-stripped inter-fence YAML text (`raw`, or null) and the verbatim body tail.
// These cases double as the module's contract — each is an input and its exact output.

describe('splitFrontmatter — pure { raw, body } split', () => {
  test('a normal doc with frontmatter → fences-stripped raw + verbatim body', () => {
    const md = '---\ntitle: x\n---\n# Heading\n\nbody text\n'
    expect(splitFrontmatter(md)).toEqual({
      raw: 'title: x',
      body: '# Heading\n\nbody text\n',
    })
  })

  test('no frontmatter → raw is null and body is the byte-identical whole doc', () => {
    const md = '# Heading\n\njust a body, no frontmatter\n'
    const split = splitFrontmatter(md)
    expect(split.raw).toBeNull()
    expect(split.body).toBe(md)
  })

  test('empty block (`---\\n---`) → raw is the empty string, body is the rest', () => {
    const md = '---\n---\nrest\n'
    expect(splitFrontmatter(md)).toEqual({ raw: '', body: 'rest\n' })
  })

  test('doc ends at the closing fence → body is the empty string', () => {
    const md = '---\na: 1\n---'
    expect(splitFrontmatter(md)).toEqual({ raw: 'a: 1', body: '' })
  })

  test('a body that itself contains a `---` thematic break is preserved verbatim', () => {
    const md = '---\na: 1\n---\nintro\n\n---\n\nafter\n'
    expect(splitFrontmatter(md)).toEqual({
      raw: 'a: 1',
      // the later `---` stays in the body (recognized as an HR, not a second fence)
      body: 'intro\n\n---\n\nafter\n',
    })
  })

  test('CRLF body: exactly one closing-fence terminator is skipped, CRLFs preserved', () => {
    const md = '---\r\na: 1\r\n---\r\nbody line\r\n'
    expect(splitFrontmatter(md)).toEqual({ raw: 'a: 1', body: 'body line\r\n' })
  })

  test('no trailing newline after the closing fence → body starts immediately', () => {
    const md = '---\na: 1\n---\nbody with no final newline'
    expect(splitFrontmatter(md)).toEqual({ raw: 'a: 1', body: 'body with no final newline' })
  })
})

describe('parse() agreement — DocTree.body uses the same splitter', () => {
  const cases = [
    '---\ntitle: x\n---\n# Heading\n\nbody text\n',
    '# Heading\n\njust a body, no frontmatter\n',
    '---\n---\nrest\n',
    '---\na: 1\n---',
    '---\na: 1\n---\nintro\n\n---\n\nafter\n',
    '---\r\na: 1\r\n---\r\nbody line\r\n',
  ]

  for (const md of cases) {
    test(`body + raw agree for ${JSON.stringify(md)}`, () => {
      const tree = parse(md)
      const split = splitFrontmatter(md)
      expect(tree.body).toBe(split.body)
      expect(tree.frontmatter?.raw ?? null).toBe(split.raw)
    })
  }
})

describe('reconstruction — raw + body round-trips the source', () => {
  test('the normal case reassembles byte-for-byte', () => {
    const md = '---\ntitle: x\n---\n# Heading\n\nbody text\n'
    const { raw, body } = splitFrontmatter(md)
    expect(`---\n${raw}\n---\n${body}`).toBe(md)
  })
})
