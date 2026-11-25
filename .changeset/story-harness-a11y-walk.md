---
'@osdlc/story-harness': minor
---

`story-shots` gains an accessibility check and a keyboard walk. This is the first version of the package on npm; the 0.4.0 in the history was never published.

- `story-shots <package dir> --a11y` runs axe-core over every story in light and dark and fails on WCAG 2.2 A and AA violations, unless a story sets `parameters.a11y.test: 'todo'`. It reads the same `parameters.a11y` as `@storybook/addon-a11y`. Violations go to `test-results/story-a11y/a11y-report.json`.
- `story-shots <package dir> --walk` tabs through every story in light, then Shift+Tabs back, and records each stop (role, name, box, visibility, focus indicator), the reverse order and the focus of a modal dialog, with a screenshot per stop, in `test-results/story-walk/`. It is a survey and fails only on a story that errors. `WALK_MAX` sets the stops per story.
- `@osdlc/story-harness/a11y` exports the axe rules the check uses (`WCAG_TAGS`, `PAGE_RULES`, `A11Y_OPTIONS`), with no Node imports, so a Storybook preview can pass them to the addon.
- `@osdlc/story-harness/runner` also exports `walkPage`, `parseAriaLine`, `DEFAULT_WALK_MAX` and the walk's types.
- `@osdlc/story-harness/parley-capture` builds the blocks of a review page from screenshots.
