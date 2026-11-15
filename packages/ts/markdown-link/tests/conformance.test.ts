/**
 * Runs the markdown-link conformance suite,
 * `packages/conformance/markdown-link/suite.json`, against this package.
 *
 * The suite holds the cases this package and the Rust `markdown-link` crate
 * must agree on: what counts as code, the link parsers, the body scanner,
 * `displayText` and `parseTypedRef`. The crate is the family's reference: its
 * generator writes every `expect`. Offsets in the suite count code points, so
 * this package's UTF-16 indices are converted before they are compared.
 *
 * Every section and case runs. A missing section, and a section, case key or
 * input key the runner does not know, fails it.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  type CodeRules,
  type ScanOptions,
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
  stripCodeWith,
  targetRange,
} from '../src/index.ts'

interface Case {
  name: string
  input: Record<string, unknown>
  expect: unknown
}

interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

const suite = JSON.parse(
  readFileSync(new URL('../../../conformance/markdown-link/suite.json', import.meta.url), 'utf8'),
) as Suite

/** The sections this package runs. A missing or extra one fails the suite. */
const SECTIONS = ['code', 'inner', 'url', 'body', 'display', 'typed_ref']

/** The keys a case may have. */
const CASE_KEYS = ['name', 'input', 'expect']

const codePoints = (s: string): number => Array.from(s).length

/** The number of code points in `text` before UTF-16 index `index`. */
const pointsBefore = (text: string, index: number): number => codePoints(text.slice(0, index))

/** `input` as an object whose keys are `required` and, optionally, `optional`. */
function fields(
  input: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('input is not an object')
  }
  const map = input as Record<string, unknown>
  for (const k of Object.keys(map)) {
    if (!required.includes(k) && !optional.includes(k)) throw new Error(`unknown input key ${k}`)
  }
  for (const k of required) if (!(k in map)) throw new Error(`input has no ${k}`)
  return map
}

function text(map: Record<string, unknown>, key: string): string {
  const value = map[key]
  if (typeof value !== 'string') throw new Error(`${key} is not a string`)
  return value
}

function flag(map: Record<string, unknown>, key: string): boolean {
  const value = map[key]
  if (value === undefined) return false
  if (typeof value !== 'boolean') throw new Error(`${key} is not a boolean`)
  return value
}

function scanOptions(input: Record<string, unknown>): ScanOptions | undefined {
  if (!('options' in input)) return undefined
  const options = fields(input['options'], [], ['code_rules', 'skip_html_comments', 'self_links'])
  const rules = options['code_rules'] ?? 'commonmark'
  if (rules !== 'commonmark' && rules !== 'skill-export' && rules !== 'none') {
    throw new Error('code_rules is not commonmark, skill-export or none')
  }
  return {
    codeRules: rules as CodeRules,
    skipHtmlComments: flag(options, 'skip_html_comments'),
    selfLinks: flag(options, 'self_links'),
  }
}

/** Sets `key` on `out` only when `value` is not null, as the reference leaves it out. */
function setUnlessNull(out: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== null) out[key] = value
}

function body(source: string, options: ScanOptions | undefined): unknown {
  const spanned =
    options === undefined ? bodyLinksSpanned(source) : bodyLinksSpannedWith(source, options)
  const links = spanned.map((link) => {
    const out: Record<string, unknown> = {
      kind: link.kind,
      raw: link.raw,
      target: link.target,
      alias: link.alias,
      at: pointsBefore(source, link.start),
      text: source.slice(link.start, link.end),
    }
    setUnlessNull(out, 'heading', link.heading)
    setUnlessNull(out, 'block', link.block)
    setUnlessNull(out, 'size', link.size)
    return out
  })
  const scan = scanBodyWith(source, options ?? {})
  expect(scan.links).toEqual(spanned)
  const abandoned = scan.abandoned.map((a) => ({
    reason: a.reason,
    at: pointsBefore(source, a.start),
    text: source.slice(a.start, a.end),
    ...(a.embed ? { embed: true } : {}),
  }))
  if (options === undefined) {
    expect(bodyLinks(source)).toEqual(
      spanned.map((link) => ({
        target: link.target,
        kind: link.kind === 'embed' ? 'embed' : 'wikilink',
      })),
    )
  }
  return { links, abandoned }
}

/** What this package gives for `input` in `section`, as the suite's `expect`. */
function run(section: string, input: unknown): unknown {
  switch (section) {
    case 'code': {
      const source = text(fields(input, ['source']), 'source')
      const commonmark = stripCodeWith(source, 'commonmark')
      const skillExport = stripCodeWith(source, 'skill-export')
      expect(codePoints(commonmark)).toBe(codePoints(source))
      expect(codePoints(skillExport)).toBe(codePoints(source))
      const ranges = codeRanges(source, 'commonmark').map((range) => [
        pointsBefore(source, range.start),
        pointsBefore(source, range.end),
      ])
      return { commonmark, skill_export: skillExport, ranges }
    }
    case 'inner': {
      const i = fields(input, ['inner'], ['embed'])
      const inner = text(i, 'inner')
      const link = parseInner(inner, flag(i, 'embed'))
      const range = targetRange(inner)
      if (link === null || range === null) return null
      expect(inner.slice(range.start, range.end)).toBe(link.target)
      const out: Record<string, unknown> = {
        target: link.target,
        heading: link.heading,
        alias: link.alias,
        target_at: pointsBefore(inner, range.start),
      }
      setUnlessNull(out, 'block', link.block)
      setUnlessNull(out, 'size', link.size)
      return out
    }
    case 'url': {
      const url = text(fields(input, ['url']), 'url')
      return { vault_link: isVaultLinkUrl(url), target: mdLinkTarget(url) }
    }
    case 'body': {
      const i = fields(input, ['body'], ['options'])
      return body(text(i, 'body'), scanOptions(i))
    }
    case 'display':
      return { display: displayText(text(fields(input, ['text']), 'text')) }
    case 'typed_ref':
      return parseTypedRef(text(fields(input, ['value']), 'value'))
    default:
      throw new Error(`unknown section ${section}`)
  }
}

const all = Object.entries(suite.sections).flatMap(([s, section]) =>
  section.cases.map((c) => `${s}/${c.name}`),
)
const ran = new Set<string>()

describe('conformance suite', () => {
  test('is the markdown-link suite, with Rust as its reference', () => {
    expect([suite.family, suite.reference]).toEqual(['markdown-link', 'rust'])
    expect(all.length).toBeGreaterThan(0)
  })

  test('has exactly the sections this package runs', () => {
    expect(Object.keys(suite.sections).sort()).toEqual([...SECTIONS].sort())
  })

  for (const [section, { cases }] of Object.entries(suite.sections)) {
    if (!SECTIONS.includes(section)) continue
    describe(section, () => {
      for (const c of cases) {
        test(c.name, () => {
          expect(
            Object.keys(c).filter((k) => !CASE_KEYS.includes(k)),
            'unknown case keys',
          ).toEqual([])
          expect(run(section, c.input)).toStrictEqual(c.expect)
          ran.add(`${section}/${c.name}`)
        })
      }
    })
  }

  // Vitest runs a file's tests in order, so this runs last.
  test('ran every case', () => {
    expect(all.filter((n) => !ran.has(n))).toEqual([])
  })
})
