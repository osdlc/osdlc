import { describe, expect, test } from 'vitest'

import { extractVaultRefs } from './wikilinks.js'

// wikilinks.ts recognizes Obsidian vault references in already-flattened text. Each case is
// an input string and the exact VaultRef[] it yields — the module's contract at a glance.

describe('extractVaultRefs — recognize [[wikilink]] and ![[transclusion]]', () => {
  test('a plain [[wikilink]] → one wikilink ref whose target is the inner text', () => {
    expect(extractVaultRefs('see [[D-0002]] for the decision')).toEqual([
      { kind: 'wikilink', target: 'D-0002', raw: '[[D-0002]]' },
    ])
  })

  test('a leading ! marks a ![[transclusion]]', () => {
    expect(extractVaultRefs('![[Diagram]]')).toEqual([
      { kind: 'transclusion', target: 'Diagram', raw: '![[Diagram]]' },
    ])
  })

  test('`target|alias` splits the display alias off the target', () => {
    expect(extractVaultRefs('[[Note|see this]]')).toEqual([
      { kind: 'wikilink', target: 'Note', alias: 'see this', raw: '[[Note|see this]]' },
    ])
  })

  test('`target#fragment` splits the heading/^block fragment off the target', () => {
    expect(extractVaultRefs('[[Note#Section]]')).toEqual([
      { kind: 'wikilink', target: 'Note', fragment: 'Section', raw: '[[Note#Section]]' },
    ])
  })

  test('`target#^block` keeps the leading `^` in the fragment value', () => {
    expect(extractVaultRefs('[[Note#^block-id]]')).toEqual([
      { kind: 'wikilink', target: 'Note', fragment: '^block-id', raw: '[[Note#^block-id]]' },
    ])
  })

  test('multiple refs in one string are all recognized, in order', () => {
    expect(extractVaultRefs('[[A]] and then ![[B]]').map((r) => `${r.kind}:${r.target}`)).toEqual([
      'wikilink:A',
      'transclusion:B',
    ])
  })

  test('text with no vault refs → empty array', () => {
    expect(extractVaultRefs('nothing to see here')).toEqual([])
  })
})
