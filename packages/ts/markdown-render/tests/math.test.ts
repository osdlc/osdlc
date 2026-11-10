/**
 * The framework-free KaTeX seam. `renderToString` is a pure string function, so
 * no DOM is registered here — which is why these tests print "KaTeX doesn't
 * work in quirks mode": KaTeX reads `document.compatMode` and finds no document.
 * A property of the environment, not of the output asserted below.
 */

import { describe, expect, test } from 'vitest'
import { loadKatex, renderMath } from '../src/math.ts'

/**
 * The accessibility contract of `output: 'htmlAndMathml'`: a MathML twin
 * carrying the TeX source, and a visual copy assistive tech is told to skip.
 */
function expectAccessibleMath(out: string, latex: string): void {
  expect(out).toContain('class="katex"')
  expect(out).toMatch(/<span class="katex-mathml">.*?<math/s)
  expect(out).toContain(`<annotation encoding="application/x-tex">${latex}</annotation>`)
  expect(out).toMatch(/<span class="katex-html" aria-hidden="true">/)
}

describe('renderMath', () => {
  test('inline: MathML twin beside an aria-hidden visual copy', async () => {
    const out = await renderMath('x^2', false)
    expectAccessibleMath(out, 'x^2')
    expect(out).not.toContain('katex-display')
  })

  test('display: the same twin, wrapped in katex-display', async () => {
    const out = await renderMath('x^2', true)
    expectAccessibleMath(out, 'x^2')
    expect(out).toContain('class="katex-display"')
  })

  test('invalid LaTeX resolves to a katex-error span rather than rejecting', async () => {
    // What `throwOnError: false` buys: the component's `textContent` fallback
    // is for a failed import, not for a typo in an equation.
    const out = await renderMath('\\frac{', false)
    expect(out).toContain('katex-error')
    expect(out).toContain('\\frac{')
  })
})

describe('loadKatex', () => {
  test('caches the import: two calls share one promise', async () => {
    const first = loadKatex()
    const second = loadKatex()
    expect(second).toBe(first)
    expect(typeof (await first).renderToString).toBe('function')
  })
})
