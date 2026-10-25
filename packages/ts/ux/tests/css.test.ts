/** The CSS sheet: every token in every block, the theme rules, and the prefix option. */
import { describe, expect, test } from 'vitest'

import { COLOR_TOKENS, colors, cssSheet, fonts, radii, tokensCss } from '../src/index.ts'

/** The declarations of the block that `selector` opens, by property name. */
function block(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start).toBeGreaterThan(-1)
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start))
  return new Map(
    [...body.matchAll(/^\s*(--[\w-]+|color-scheme): ([^;]+);$/gm)].map((m) => [m[1]!, m[2]!]),
  )
}

describe('cssSheet', () => {
  test(':root declares light colors, radii and fonts', () => {
    const root = block(tokensCss, ':root')
    expect(root.get('color-scheme')).toBe('light dark')
    for (const t of COLOR_TOKENS) expect(root.get(`--ux-${t}`)).toBe(colors.light[t])
    for (const [k, v] of Object.entries(radii)) expect(root.get(`--ux-radius-${k}`)).toBe(v)
    for (const [k, v] of Object.entries(fonts)) expect(root.get(`--ux-font-${k}`)).toBe(v)
  })

  test('dark colors apply under prefers-color-scheme unless data-theme is light', () => {
    const media = tokensCss.indexOf('@media (prefers-color-scheme: dark) {')
    expect(media).toBeGreaterThan(-1)
    const dark = block(tokensCss.slice(media), ":root:not([data-theme='light'])")
    for (const t of COLOR_TOKENS) expect(dark.get(`--ux-${t}`)).toBe(colors.dark[t])
  })

  test("data-theme='dark' applies the dark colors outside the media query", () => {
    const dark = block(tokensCss, ":root[data-theme='dark']")
    expect(dark.get('color-scheme')).toBe('dark')
    for (const t of COLOR_TOKENS) expect(dark.get(`--ux-${t}`)).toBe(colors.dark[t])
  })

  test("data-theme='light' sets only the color scheme; :root holds the light colors", () => {
    expect([...block(tokensCss, ":root[data-theme='light']")]).toEqual([['color-scheme', 'light']])
  })

  test('the braces balance', () => {
    expect(tokensCss.split('{').length).toBe(tokensCss.split('}').length)
  })

  test('a prefix renames every property', () => {
    const css = cssSheet({ prefix: 'd' })
    expect(css).toContain('--d-bg-base: #f8f8fa;')
    expect(css).toContain('--d-radius-pill: 999px;')
    expect(css).not.toContain('--ux-')
    expect(cssSheet({ prefix: 'ux' })).toBe(tokensCss)
  })

  test.each(['', 'UX', '1a', 'a b', 'a;}', '-a'])('prefix %j throws a RangeError', (prefix) => {
    expect(() => cssSheet({ prefix })).toThrow(RangeError)
  })
})
