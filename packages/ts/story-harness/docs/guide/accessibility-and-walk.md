---
title: Accessibility check and keyboard walk
sidebar:
  order: 6
description: story-shots --a11y runs axe-core over every story; story-shots --walk tabs through each one and records what took focus.
---

Two more modes of `story-shots` run in the same pinned container as the screenshot check, over
the same built Storybook. Neither reads or writes baselines.

```sh
story-shots <package dir> --a11y [--include p1,p2] [--exclude p3] [--settle-ms N]
story-shots <package dir> --walk [--include p1,p2] [--exclude p3] [--settle-ms N]
```

Pass one of `--update`, `--a11y` and `--walk`. `--include`, `--exclude` and `--settle-ms` work as
they do for the screenshot check, and a story with `parameters.screenshot.skip` is left out of
both modes.

## The accessibility check

`--a11y` opens every story in light and dark and runs [axe-core](https://github.com/dequelabs/axe-core)
over the page. It checks WCAG 2.0 to 2.2 at levels A and AA. Colour contrast is one of those
rules, which is why both themes are scanned. axe-core 4.14.0 is installed in the container; it is
pinned in `story-shots.sh`, so a run gives the same answer on a laptop and in CI.

Four rules are off, because a story is not a page: Storybook's iframe has no `lang`, landmarks or
`h1` of its own. They are `html-has-lang`, `landmark-one-main`, `page-has-heading-one` and
`region`.

### What fails

A story is held to the same `parameters.a11y` that `@storybook/addon-a11y` reads, so the
Storybook panel and this check agree:

| Parameter | Effect |
|---|---|
| `test: 'error'` | A violation fails the check |
| `test: 'todo'` | Violations are reported, not failed (the addon's default) |
| `test: 'off'` | The story is not scanned |
| `config`, `options`, `context` | Passed to `axe.configure` and `axe.run`, and as what is scanned |

The addon's default is `todo`, so a package that wants the check to fail sets `test: 'error'` in
`.storybook/preview.ts`:

```ts
// .storybook/preview.ts
import { A11Y_OPTIONS } from '@osdlc/story-harness/a11y'

export default {
  parameters: {
    a11y: { test: 'error', options: A11Y_OPTIONS },
  },
}
```

`@osdlc/story-harness/a11y` exports the rules the check uses (`WCAG_TAGS`, `PAGE_RULES` and
`A11Y_OPTIONS`) and imports nothing from Node, so a preview can import it. Passing them as the
addon's `options` makes the panel and the check run the same rules.

A story can scan less than the page, or relax a rule:

```ts
export const Menu: Story = {
  parameters: {
    a11y: {
      context: '#menu', // scan this subtree only
      options: { rules: { 'color-contrast': { enabled: false } } },
    },
  },
}
```

### Reading the result

Every story and theme with a violation is in
`<package dir>/test-results/story-a11y/a11y-report.json`: the rule, its impact, the help text and
each failing element's selector and failure summary. The command prints a count per rule. A story
set to `todo` is reported there and does not fail the run.

Keep the pinned axe-core on the version your `@storybook/addon-a11y` resolves to. If the two
differ, a rule can fire in one and not in the other.

## The keyboard walk

`--walk` opens every story in light, presses Tab from the start of the document, and records each
stop. Then it presses Shift+Tab to walk back. It is a survey, not a gate: it fails only when a
story errors, and findings never fail the run. A story leaves it out with
`parameters.walk.skip: '<why>'`, or with `parameters.screenshot.skip`.

`WALK_MAX=N` sets the number of stops per story. The default is 40.

```sh
WALK_MAX=60 story-shots . --walk --include my-menu-
```

### What a walk records

A walk starts with a zero-size marker at the top of the body focused. It presses Tab until focus
returns to a stop it already saw, leaves the page, leaves the story root, leaves an open modal
dialog, or enters an `<iframe>` (which the walk does not go into). For each stop it records:

- the role and accessible name, and a selector-like description;
- the element's box, and whether it is visible, inside the viewport and not covered;
- whether it showed a focus indicator.

The indicator is read from computed style. The outline, box shadow, border, background, text
colour, opacity, filter, transform and text decoration of the focused element, its two nearest
ancestors, its next sibling, its first child and its `::before` and `::after` are compared with
the same elements once focus has moved on. Any change counts. A ring drawn somewhere else (a
distant element, an image, an SVG) is missed, and any other change counts as one. A stop whose
element is gone by then is recorded as unknown, not as a finding.

A native input that is visually hidden (opacity 0 or at most 1px) is judged on its label or the
control next to it, which is what a user sees; the stop's `proxy` names that element.

If the story holds an open modal dialog, the walk checks that Tab stays inside it, presses Escape
from the first stop inside, and checks that focus goes back to the element that was focused
before the walk began. A story that renders its dialog already open has no opener, so where focus
goes after Escape is not judged.

### Reading the result

For each story, `<package dir>/test-results/story-walk/walk/<story>/` holds:

| File | Holds |
|---|---|
| `start.png` | The page before the first Tab |
| `01.png`, `02.png`, ... | The viewport at each stop |
| `walk.json` | The story's record: stops, how it ended, the reverse walk, the dialog check |

`walk-report.json` in `test-results/story-walk/` holds every story's record. The shape is the
`WalkRecord` type of `@osdlc/story-harness/runner`.

### Walking one page yourself

`walkPage` is what the mode runs for each story. A Playwright spec can walk any page it has open:

```ts
import { walkPage } from '@osdlc/story-harness/runner'

const walk = await walkPage(page, { id: 'menu', outDir: 'test-results/menu', max: 20 })
expect(walk.stops.map((s) => s.name)).toEqual(['Open', 'Close'])
```

### From a walk to a review page

`@osdlc/story-harness/parley-capture` builds the blocks of a review page from screenshots:
`regionFromBox` turns a measured pixel box into a region inside an image, and `figure`, `steps`,
`finding`, `heading` and `parleyDocument` return plain objects shaped for a
[parley](https://github.com/osdlc/parley) document, which you write with `JSON.stringify`. It
knows nothing about stories or Playwright, so any audit that captures screenshots can use it.
Turning a `WalkRecord` into findings is left to you, since which stops are a problem depends on
your component library.
