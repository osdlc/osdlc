/**
 * `A11Y_OPTIONS` is what the guide tells users to pass to axe and to
 * `@storybook/addon-a11y`, so it must be assignable to axe-core's `RunOptions`.
 * The check is the typecheck; axe-core is a dev dependency for its types only.
 */
import type { RunOptions } from 'axe-core'
import { expect, test } from 'vitest'

import { A11Y_OPTIONS, PAGE_RULES, WCAG_TAGS } from '../src/runner/a11y.ts'

test('A11Y_OPTIONS is assignable to axe-core RunOptions', () => {
  const options: RunOptions = A11Y_OPTIONS
  expect(options.runOnly).toEqual({ type: 'tag', values: [...WCAG_TAGS] })
})

test('the rule lists are read-only to a consumer', () => {
  // @ts-expect-error a readonly array has no push
  const push = () => WCAG_TAGS.push('x')
  // @ts-expect-error a readonly array has no push
  const pushRules = () => PAGE_RULES.push('x')
  expect([push, pushRules]).toHaveLength(2)
})

test('./a11y imports nothing', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../src/runner/a11y.ts', import.meta.url), 'utf8')
  expect(source).not.toMatch(/^\s*import\s/m)
})
