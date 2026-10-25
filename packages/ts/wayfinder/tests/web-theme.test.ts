/**
 * The page's stylesheet: colors come from the shared tokens only, text is
 * at least 11px, and the colors the page mixes itself meet WCAG AA in both
 * themes.
 */

import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { contrastRatio, mixColors, parseColor } from '@osdlc/color'
import { THEMES, colors } from '@osdlc/ux'

const CSS = readFileSync(fileURLToPath(new URL('../src/web/styles.css', import.meta.url)), 'utf-8')
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

/** The first group of `pattern`, a `color-mix` percentage, as a fraction. */
function mixPercent(pattern: RegExp): number {
  const match = pattern.exec(RULES)
  expect(match, `no match for ${pattern}`).not.toBeNull()
  return Number(match![1]) / 100
}

describe('the stylesheet', () => {
  test('names no color literal: every color is a token or a mix of tokens', () => {
    expect(RULES).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(RULES).not.toMatch(/\b(rgba?|hsla?)\(/i)
  })

  test('sets no text smaller than 11px', () => {
    const sizes = [
      ...RULES.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g),
      ...RULES.matchAll(/font:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g),
    ].map((m) => Number(m[1]))
    expect(sizes.length).toBeGreaterThan(0)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11)
  })
})

describe.each(THEMES)('the %s theme', (theme) => {
  const palette = colors[theme]
  const c = (token: keyof typeof palette) => parseColor(palette[token])

  test('a control border has 3:1 against both grounds', () => {
    const amount = mixPercent(
      /--wf-control-border:\s*color-mix\(in srgb, var\(--wf-text-muted\) (\d+)%, var\(--wf-bg-surface\)\)/,
    )
    const border = mixColors(c('bg-surface'), c('text-muted'), amount)
    expect(contrastRatio(border, c('bg-surface'))).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(border, c('bg-base'))).toBeGreaterThanOrEqual(3)
  })

  test('the withheld bar text has 4.5:1 against its tinted ground', () => {
    const amount = mixPercent(
      /\.trustbar \{[^}]*background: color-mix\(in srgb, var\(--wf-status-warning\) (\d+)%, var\(--wf-bg-surface\)\)/,
    )
    const ground = mixColors(c('bg-surface'), c('status-warning'), amount)
    expect(contrastRatio(c('status-warning'), ground)).toBeGreaterThanOrEqual(4.5)
  })

  test('muted text has 4.5:1 against both grounds', () => {
    expect(contrastRatio(c('text-muted'), c('bg-surface'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(c('text-muted'), c('bg-base'))).toBeGreaterThanOrEqual(4.5)
  })
})
