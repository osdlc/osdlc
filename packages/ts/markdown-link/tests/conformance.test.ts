/**
 * The TypeScript half of the shared case file. It reads the `conformance.json`
 * that the `markdown-link` crate's `tests/conformance.rs` reads, whose doc
 * describes each section. Offsets in the file count code points.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  type AbandonReason,
  type BodyLinkKind,
  type ScanOptions,
  type Size,
  bodyLinks,
  bodyLinksSpanned,
  bodyLinksSpannedWith,
  codeRanges,
  displayText,
  isVaultLinkUrl,
  mdLinkTarget,
  parseInner,
  parseTypedRef,
  scanBodyWith,
  stripCode,
  stripCodeWith,
  targetRange,
} from '../src/index.ts'

interface CodeCase {
  name: string
  source: string
  stripped: string
  strippedSkillExport?: string
  /** `codeRanges` under `'commonmark'`, as `[start, end]` code point pairs. */
  ranges?: [number, number][]
}

interface InnerCase {
  name: string
  inner: string
  embed?: boolean
  parsed: {
    target: string
    heading: string | null
    alias: string | null
    targetAt: number
    block?: string | null
    size?: Size | null
  } | null
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
  options?: ScanOptions
  links: {
    kind: BodyLinkKind
    raw: string
    target: string
    alias: string | null
    at: number
    text: string
    heading?: string | null
    title?: string | null
    block?: string | null
    size?: Size | null
  }[]
  /** Each `[[` the scan gave up on. Left out: none. */
  abandoned?: { reason: AbandonReason; embed?: boolean; at: number; text: string }[]
}

/**
 * Adds `key` to `actual` when the expected case names it or the value is not
 * null, so a case that leaves an optional key out still pins it to null.
 */
function optional(
  actual: Record<string, unknown>,
  expected: object | undefined,
  key: string,
  value: unknown,
): void {
  if ((expected !== undefined && key in expected) || value !== null) actual[key] = value
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
      if (c.ranges !== undefined) {
        expect(
          codeRanges(c.source, 'commonmark').map((range) => [
            codePoints(c.source.slice(0, range.start)),
            codePoints(c.source.slice(0, range.end)),
          ]),
        ).toEqual(c.ranges)
      }
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
        const link = parseInner(c.inner, c.embed ?? false)
        const range = targetRange(c.inner)
        let actual: Record<string, unknown> | null = null
        if (link !== null && range !== null) {
          actual = {
            target: link.target,
            heading: link.heading,
            alias: link.alias,
            targetAt: codePoints(c.inner.slice(0, range.start)),
          }
          optional(actual, c.parsed ?? undefined, 'block', link.block)
          optional(actual, c.parsed ?? undefined, 'size', link.size)
        }
        expect(actual).toEqual(c.parsed)
        if (range !== null) expect(c.inner.slice(range.start, range.end)).toBe(link!.target)
      } else if ('url' in c) {
        expect(isVaultLinkUrl(c.url)).toBe(c.vaultLink)
        expect(mdLinkTarget(c.url)).toBe(c.target)
      } else {
        const spanned =
          c.options === undefined
            ? bodyLinksSpanned(c.body)
            : bodyLinksSpannedWith(c.body, c.options)
        expect(
          spanned.map((link, n) => {
            const actual: Record<string, unknown> = {
              kind: link.kind,
              raw: link.raw,
              target: link.target,
              alias: link.alias,
              at: codePoints(c.body.slice(0, link.start)),
              text: c.body.slice(link.start, link.end),
            }
            const want = c.links[n]
            optional(actual, want, 'heading', link.heading)
            optional(actual, want, 'title', link.title)
            optional(actual, want, 'block', link.block)
            optional(actual, want, 'size', link.size)
            return actual
          }),
        ).toEqual(c.links)
        const scan = scanBodyWith(c.body, c.options ?? {})
        expect(scan.links).toEqual(spanned)
        expect(
          scan.abandoned.map((a) => ({
            reason: a.reason,
            ...(a.embed ? { embed: true } : {}),
            at: codePoints(c.body.slice(0, a.start)),
            text: c.body.slice(a.start, a.end),
          })),
        ).toEqual(c.abandoned ?? [])
        if (c.options !== undefined) return
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
