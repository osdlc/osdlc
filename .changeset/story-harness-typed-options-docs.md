---
'@osdlc/story-harness': patch
---

Typed accessibility options, documented exports, and tests for every mode parameter.

- `A11Y_OPTIONS` from `@osdlc/story-harness/a11y` is typed so it assigns to axe-core's `RunOptions`, where the guide tells you to pass it. `WCAG_TAGS` and `PAGE_RULES` are `readonly string[]`. The entry still imports nothing.
- `parseAriaLine` is no longer exported from `@osdlc/story-harness/runner`. It was an internal helper of `walkPage`, and 0.5.0 is days old.
- `walkPage`, the `Walk*` types and every export of `@osdlc/story-harness/parley-capture` are tagged `@experimental`, and the README lists them. `heading` takes a named, exported `HeadingInput`.
- Every export has a TSDoc comment, and a test fails on one that has none.
- The axe-core installed for `story-shots --a11y` is 4.14.1, the version a fresh `@storybook/addon-a11y` install resolves to, in place of 4.14.0.
- The README compares the package with the accessibility and keyboard tools it replaces, and says every mode instead of three. The decision notes and the changelog history say that the first published version is 0.5.0.
- New tests cover `parameters.a11y` (`test`, `config`, `options`, `context`), `parameters.walk.skip`, `parameters.screenshot.skip` and `--include` in every mode, and the shape of a `parleyDocument`.
