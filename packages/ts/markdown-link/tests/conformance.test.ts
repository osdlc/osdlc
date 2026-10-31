/**
 * The TypeScript half of the shared case file. It reads the `conformance.json`
 * that the `markdown-link` crate's `tests/conformance.rs` reads, whose doc
 * describes each section. Offsets in the file count code points.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  type BodyLinkKind,
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
} from '../src/index.ts'

interface CodeCase {
  name: string
  source: string
  stripped: string
  strippedSkillExport?: string
}

interface InnerCase {
  name: string
  inner: string
  parsed: { target: string; heading: string | null; alias: string | null; targetAt: number } | null
}

interface UrlCase {
  name: string
  url: string
  vaultLink: boolean
  target: string
}

interface BodyCase {
  name: string
  body: string
  links: {
    kind: BodyLinkKind
    raw: string
    target: string
    alias: string | null
    at: number
    text: string
  }[]
}

type ParseCase = InnerCase | UrlCase | BodyCase

interface DisplayCase {
  name: string
  text: string
  display: string
}

interface TypedRefCase {
  name: string
  value: string
  typedRef: { kind: string; slug: string; alias: string | null } | null
}

const cases = JSON.parse(
  readFileSync(
    new URL('../../../rust/markdown-link/tests/fixtures/conformance.json', import.meta.url),
    'utf8',
  ),
) as {
  code: CodeCase[]
  parse: ParseCase[]
  display: DisplayCase[]
  typedRef: TypedRefCase[]
}

const codePoints = (s: string): number => Array.from(s).length

describe('code cases', () => {
  test('the section is not empty', () => {
    expect(cases.code.length).toBeGreaterThan(0)
  })

  for (const c of cases.code) {
    test(c.name, () => {
      const commonmark = stripCode(c.source)
      const skillExport = stripCodeWith(c.source, 'skill-export')
      expect(commonmark).toBe(c.stripped)
      expect(skillExport).toBe(c.strippedSkillExport ?? c.stripped)
      expect(codePoints(commonmark)).toBe(codePoints(c.source))
      expect(codePoints(skillExport)).toBe(codePoints(c.source))
    })
  }
})

describe('parse cases', () => {
  test('the section is not empty', () => {
    expect(cases.parse.length).toBeGreaterThan(0)
  })

  for (const c of cases.parse) {
    test(c.name, () => {
      if ('inner' in c) {
        const link = parseInner(c.inner, false)
        const range = targetRange(c.inner)
        const actual =
          link === null || range === null
            ? null
            : {
                target: link.target,
                heading: link.heading,
                alias: link.alias,
                targetAt: codePoints(c.inner.slice(0, range.start)),
              }
        expect(actual).toEqual(c.parsed)
        if (range !== null) expect(c.inner.slice(range.start, range.end)).toBe(link!.target)
      } else if ('url' in c) {
        expect(isVaultLinkUrl(c.url)).toBe(c.vaultLink)
        expect(mdLinkTarget(c.url)).toBe(c.target)
      } else {
        const spanned = bodyLinksSpanned(c.body)
        expect(
          spanned.map((link) => ({
            kind: link.kind,
            raw: link.raw,
            target: link.target,
            alias: link.alias,
            at: codePoints(c.body.slice(0, link.start)),
            text: c.body.slice(link.start, link.end),
          })),
        ).toEqual(c.links)
        expect(bodyLinks(c.body)).toEqual(
          spanned.map((link) => ({
            target: link.target,
            kind: link.kind === 'embed' ? 'embed' : 'wikilink',
          })),
        )
      }
    })
  }
})

describe('display cases', () => {
  test('the section is not empty', () => {
    expect(cases.display.length).toBeGreaterThan(0)
  })
  for (const c of cases.display) {
    test(c.name, () => {
      expect(displayText(c.text)).toBe(c.display)
    })
  }
})

describe('typedRef cases', () => {
  test('the section is not empty', () => {
    expect(cases.typedRef.length).toBeGreaterThan(0)
  })
  for (const c of cases.typedRef) {
    test(c.name, () => {
      expect(parseTypedRef(c.value)).toEqual(c.typedRef)
    })
  }
})
