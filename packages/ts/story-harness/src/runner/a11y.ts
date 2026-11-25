/**
 * The axe rules a story is held to, shared by the `--a11y` check
 * (story-a11y.e2e.ts) and `@storybook/addon-a11y` through a preview's
 * `parameters.a11y`, so the panel, the addon's own run and the check agree.
 */

/** WCAG 2.2 A and AA. Best-practice rules are not part of the gate. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

/**
 * Rules about a whole page, which a story is not: Storybook's iframe has no
 * `lang`, landmarks or `h1` of its own, and the app shell supplies them.
 */
export const PAGE_RULES = ['html-has-lang', 'landmark-one-main', 'page-has-heading-one', 'region']

/** axe `run` options for a story: the WCAG tags, without the page rules. */
export const A11Y_OPTIONS = {
  runOnly: { type: 'tag', values: WCAG_TAGS },
  rules: Object.fromEntries(PAGE_RULES.map((rule) => [rule, { enabled: false }])),
}
