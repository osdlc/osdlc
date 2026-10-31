/**
 * The package used the way a consumer uses it: through its name only. Each
 * export appears here at least once.
 */

import { describe, expect, test } from 'vitest'

import {
  ATTACHMENT_EXTENSIONS,
  bodyLinks,
  bodyLinksSpanned,
  displayText,
  isVaultLinkUrl,
  mdLinkTarget,
  parseInner,
  parseTypedRef,
  stripCode,
  stripCodeWith,
  targetRange,
  type BodyLink,
  type BodyLinkKind,
  type CodeRules,
  type LinkKind,
  type RawLink,
  type TextRange,
  type TypedRef,
  type WikiLink,
} from '@osdlc/markdown-link'

describe('the README quick start', () => {
  test('finds the wikilink and skips the one in code', () => {
    const links: BodyLink[] = bodyLinksSpanned('See [[Note#h|alias]] and `[[not a link]]`')
    expect(links).toEqual([
      { kind: 'wikilink', raw: 'Note#h|alias', target: 'Note', alias: 'alias', start: 4, end: 20 },
    ])
  })
})

describe('code', () => {
  test('stripCode blanks code and keeps the length', () => {
    const text = 'a `[[x]]` b'
    expect(stripCode(text)).toBe('a         b')
    expect(stripCode(text)).toHaveLength(text.length)
  })

  test('stripCodeWith takes the rules by name', () => {
    const rules: CodeRules = 'skill-export'
    expect(stripCodeWith('a `x` b', rules)).toBe('a     b')
  })
})

describe('one link', () => {
  test('parseInner splits target, heading and alias', () => {
    const link: WikiLink | null = parseInner('Note#Heading|Alias', false)
    expect(link).toMatchObject({ target: 'Note', heading: 'Heading', alias: 'Alias' })
  })

  test('targetRange is where the target sits', () => {
    const inner = ' Note|Alias'
    const range: TextRange | null = targetRange(inner)
    expect(range).not.toBeNull()
    expect(inner.slice(range!.start, range!.end)).toBe('Note')
  })
})

describe('markdown link URLs', () => {
  test('a relative note URL is a vault link and loses .md', () => {
    expect(isVaultLinkUrl('Notes/My%20Note.md')).toBe(true)
    expect(isVaultLinkUrl('https://example.com')).toBe(false)
    expect(mdLinkTarget('Notes/My%20Note.md')).toBe('Notes/My Note')
  })

  test('ATTACHMENT_EXTENSIONS lists image types', () => {
    expect(ATTACHMENT_EXTENSIONS).toContain('png')
  })
})

describe('a body', () => {
  test('bodyLinks is the scan without spans', () => {
    const kinds: BodyLinkKind[] = bodyLinksSpanned('![[img.png]] [x](Other.md)').map((l) => l.kind)
    expect(kinds).toEqual(['embed', 'markdown'])
    const raw: RawLink[] = bodyLinks('[[A]] ![[b.png]]')
    const kind: LinkKind | undefined = raw[1]?.kind
    expect(raw).toEqual([
      { target: 'A', kind: 'wikilink' },
      { target: 'b.png', kind: 'embed' },
    ])
    expect(kind).toBe('embed')
  })
})

describe('display text and typed references', () => {
  test('displayText shows the alias, or the target', () => {
    expect(displayText('See [[Note|the note]] and ![[img.png|300]]')).toBe(
      'See the note and img.png',
    )
  })

  test('parseTypedRef reads a whole [[type/slug]] value', () => {
    const ref: TypedRef | null = parseTypedRef('[[task/fix-it|Fix it]]')
    expect(ref).toEqual({ kind: 'task', slug: 'fix-it', alias: 'Fix it' })
    expect(parseTypedRef('not a ref')).toBeNull()
  })
})
