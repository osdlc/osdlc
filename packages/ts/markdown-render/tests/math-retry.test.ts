/**
 * The KaTeX loader in its own file: it caches at module level, so a failing
 * import has to be staged on a fresh copy of `math.ts`.
 */

import { expect, test, vi } from 'vitest'

test('a failed katex import is not cached: the next call loads again', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const real = await import('katex')
  let failNext = true
  vi.resetModules()
  vi.doMock('katex', () => {
    if (failNext) {
      failNext = false
      throw new Error('chunk load failed')
    }
    return real
  })
  const { loadKatex } = await import('../src/math.ts')

  await expect(loadKatex()).rejects.toThrow()
  const katex = await loadKatex()
  expect(typeof katex.renderToString).toBe('function')
})
