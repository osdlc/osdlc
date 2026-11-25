// The axe rules a story is held to. A Storybook preview passes them to
// @storybook/addon-a11y, so the panel and `story-shots --a11y` agree.
import { expect, test } from 'vitest'

import { A11Y_OPTIONS, PAGE_RULES, WCAG_TAGS } from '@osdlc/story-harness/a11y'

test('the options run the WCAG tags and switch the whole-page rules off', () => {
  expect(A11Y_OPTIONS.runOnly).toEqual({ type: 'tag', values: WCAG_TAGS })
  expect(WCAG_TAGS).toContain('wcag22aa')
  for (const rule of PAGE_RULES) expect(A11Y_OPTIONS.rules[rule]).toEqual({ enabled: false })
})
