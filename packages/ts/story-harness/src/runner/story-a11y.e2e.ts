/**
 * One test per story and theme: open the story, run axe-core over the page,
 * and fail on any WCAG 2.2 A or AA violation unless the story sets
 * `parameters.a11y.test: 'todo'`. Each story with violations writes them to
 * `<ARTIFACTS_DIR>/a11y/<id>--<theme>.json`. A story with
 * `parameters.screenshot.skip` is skipped here too.
 *
 * Run through `story-shots --a11y`, never directly: the container installs
 * axe-core next to Playwright and sets the environment this file reads.
 *
 * A story tunes the scan with the `parameters.a11y` that
 * `@storybook/addon-a11y` reads, so the panel and this check agree:
 * `test: 'off'` skips the story, `config` goes to `axe.configure`, `options`
 * to `axe.run` over the shared `A11Y_OPTIONS` (./a11y.ts), and `context` replaces
 * the whole document as what is scanned.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { A11Y_OPTIONS } from './a11y.ts'
import {
  isNarrowOnly,
  NARROW_VIEWPORT,
  openStory,
  preparePage,
  storyParameters,
  storyRunEnv,
  THEMES,
} from './story.ts'

const { settleMs, ids } = storyRunEnv('--a11y')
const reportDir = join(process.env.ARTIFACTS_DIR ?? './test-results', 'a11y')

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
)

interface A11yParameters {
  test?: 'off' | 'todo' | 'error'
  config?: Record<string, unknown>
  options?: Record<string, unknown>
  context?: unknown
}

interface Violation {
  id: string
  impact: string | null
  help: string
  helpUrl: string
  nodes: Array<{ target: unknown[]; failureSummary?: string }>
}

for (const id of ids) {
  for (const theme of THEMES) {
    test(`${id} ${theme}`, async ({ page, baseURL }) => {
      await preparePage(page)
      if (isNarrowOnly(id)) await page.setViewportSize(NARROW_VIEWPORT)
      // With `test: 'error'` the addon runs axe in the story itself and a
      // violation marks the story failed, so take the error and scan anyway:
      // the report still lists what failed.
      let storyError: string | null = null
      const shot = await openStory(page, baseURL!, id, theme, {
        settleMs,
        onStoryError: (message) => (storyError = message),
      })
      test.skip(!!shot.skip, shot.skip)
      const params = await storyParameters<A11yParameters>(page, 'a11y')
      test.skip(params.test === 'off', 'parameters.a11y.test is off')

      await page.addScriptTag({ content: axeSource })
      const violations = await page.evaluate(
        async ({ params, base }) => {
          const axe = (window as any).axe
          if (params.config) axe.configure(params.config)
          const options = {
            ...base,
            ...params.options,
            rules: { ...base.rules, ...(params.options?.rules as object | undefined) },
          }
          const result = await axe.run(params.context ?? document, options)
          return result.violations as Violation[]
        },
        { params, base: A11Y_OPTIONS },
      )

      if (violations.length > 0) {
        mkdirSync(reportDir, { recursive: true })
        writeFileSync(
          join(reportDir, `${id}--${theme}.json`),
          JSON.stringify({ id, theme, violations }, null, 2),
        )
      }
      const summary = violations.map(
        (v) =>
          `${v.id} (${v.impact}): ${v.help} at ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      )
      if (params.test === 'todo') {
        test.info().annotations.push({ type: 'a11y-todo', description: summary.join('\n') })
        // A todo story is not failed for violations, but a story that errors is.
        expect(storyError, 'story error').toBeNull()
        return
      }
      expect(summary, 'WCAG A/AA violations').toEqual([])
      expect(storyError, 'story error').toBeNull()
    })
  }
}
