# @osdlc/ux

Design tokens for tools that have a web page and a terminal UI. The tokens
are data: colors for light and dark, radii and fonts. The package turns them
into a CSS sheet for the web page and into ANSI codes for the terminal, so
one change to a token changes both. It also decides whether a terminal gets
color, and makes untrusted text safe to print and fits it to a width.

## Why

A tool with a web view and a terminal UI tends to keep two sets of colors,
which drift. A terminal UI also has to answer the same questions every time:
does this stream get color, how many colors does the terminal have, and what
does a task name from a repository do when it holds an escape sequence?

This package answers them once:

- The tokens are plain values, checked by a test: every pair in
  `CONTRAST_PAIRS`, which is each text color on each background, meets WCAG
  AA contrast in light and dark.
- The CSS sheet follows the system theme and an explicit `data-theme`
  choice.
- Color detection follows `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb`, the TTY
  check and a `--color`/`--no-color` flag. It is a pure function over its
  input, so a test can pass any environment.
- The text helpers remove every terminal control, including OSC 52
  clipboard writes and title changes, and count columns for wide characters
  and combining marks.

All color arithmetic, such as contrast and the distance used to pick the
nearest terminal color, comes from
[`@osdlc/color`](https://github.com/osdlc/osdlc/tree/main/packages/ts/color).

It holds no components, layout or wording. Those belong to the app.

## Install

```sh
npm install @osdlc/ux
```

`pnpm add @osdlc/ux` and `yarn add @osdlc/ux` work too.

ESM only. Node.js 22 or later.

## Quick start

```ts
import { ansiColors, detectColorLevel, fitWidth, paint, stripControls } from '@osdlc/ux'

// Decide once per stream. Pass the --color / --no-color flag as override.
const level = detectColorLevel({ env: process.env, isTTY: process.stdout.isTTY })
const ansi = ansiColors(level, 'dark')

// A name from a repository is untrusted: strip controls, then fit it.
const name = fitWidth(stripControls('build\x1b]0;pwned\x07 all'), 12)
const line = `${paint('✓', ansi['status-success'])} ${name}` // the mark shows without color
```

For a web page, load the sheet and use the custom properties. The import
below needs a bundler that resolves package paths; otherwise serve
`tokensCss` or copy `tokens.css` from the package.

```css
@import '@osdlc/ux/tokens.css';

body {
  background: var(--ux-bg-surface);
  color: var(--ux-text-primary);
  font-family: var(--ux-font-sans);
}
```

## Color is never the only signal

An app that uses these tokens follows one rule: every state shown in color
also has a text or symbol marker. A failed task is red and marked `✗` or
"failed"; a selected row is highlighted and marked `>`. The state then still
shows with color off (`NO_COLOR`, a pipe, a 16-color terminal with a custom
palette) and to a reader who cannot tell the colors apart.

## API

No function changes its arguments, and every exported object is frozen.

### Tokens

- `THEMES` is `['light', 'dark']`. `Theme` is one of them.
- `COLOR_TOKENS` lists the color token names. `ColorToken` is one of them:
  grounds `bg-base`, `bg-surface` and `bg-hover`; text `text-primary`,
  `text-secondary` and `text-muted`; lines `border` and `border-subtle`;
  `accent`, `accent-hover` and `accent-fg` (the label on an accent fill);
  and `status-success`, `status-warning` and `status-error`.
- `colors[theme]` is a `Palette`: a `#rrggbb` value for each token.
- `CONTRAST_PAIRS` lists the `[text, ground]` pairs the tokens promise are
  readable: every text, accent and status token on every ground, and
  `accent-fg` on `accent` and `accent-hover`. Each meets WCAG AA, 4.5:1, in
  both themes. Borders are not text and are not listed.
- `radii` holds corner radii as CSS lengths: `xs`, `sm`, `md`, `lg` and
  `pill`.
- `fonts` holds font stacks: `sans` and `mono`.
- `ansi16[theme]` is the basic terminal color, 0-15, chosen for each token.
  See [Terminal colors](#terminal-colors).

```ts
import { CONTRAST_PAIRS, colors, radii } from '@osdlc/ux'

colors.dark['status-error'] // '#f7768e'
radii.md // '10px'
CONTRAST_PAIRS.length // 26
```

### CSS

- `cssSheet(options)` returns a sheet that declares every token as a custom
  property on `:root`. Light colors, radii and fonts are on `:root`. Dark
  colors apply under `prefers-color-scheme: dark` unless the root element
  has `data-theme="light"`, and always with `data-theme="dark"`.
  `color-scheme` follows the same rules. Names are `--<prefix>-<token>`,
  `--<prefix>-radius-<name>` and `--<prefix>-font-<name>`.
  `CssSheetOptions.prefix` is the prefix, `ux` by default.
- `tokensCss` is `cssSheet()`. The package ships the same text as
  `@osdlc/ux/tokens.css`.

```ts
import { cssSheet, tokensCss } from '@osdlc/ux'

tokensCss.includes('--ux-bg-base: #f8f8fa;') // true
cssSheet({ prefix: 'app' }).includes('--app-accent: #1d59d8;') // true
```

### Color detection

`detectColorLevel(input)` returns a `ColorLevel`: `none`, `ansi16`,
`ansi256` or `truecolor`. `COLOR_LEVELS` lists them, fewest colors first.
The input, a `ColorDetectInput`, is `env`, `isTTY` and an optional
`override`. The function reads nothing else.

The rules follow [no-color.org](https://no-color.org) and the
`FORCE_COLOR` convention of supports-color. The first row that
applies decides:

| Order | When | Level |
| --- | --- | --- |
| 1 | `override` is `false` (`--no-color`) | `none` |
| 1 | `override` is a level | that level |
| 1 | `override` is `true` (`--color`) | the level `FORCE_COLOR` asks for in row 3, when it asks for one; else the terminal's level |
| 2 | `NO_COLOR` is set and not empty | `none` |
| 3 | `FORCE_COLOR` is `0` or `false` | `none` |
| 3 | `FORCE_COLOR` is empty, `true` or `1` | `ansi16` |
| 3 | `FORCE_COLOR` is `2` | `ansi256` |
| 3 | `FORCE_COLOR` is `3` or a larger number | `truecolor` |
| 3 | `FORCE_COLOR` has any other value | the terminal's level |
| 4 | `TERM` is `dumb` | `none` |
| 5 | `isTTY` is not `true` | `none` |
| 6 | otherwise | the terminal's level |

So a flag wins over every variable, `NO_COLOR` wins over `FORCE_COLOR`, and
`FORCE_COLOR` turns color on in a pipe and under `TERM=dumb`. Values are
case-sensitive: `FORCE_COLOR=FALSE` turns color on.

The terminal's level is `truecolor` when `COLORTERM` is `truecolor` or
`24bit`, `TERM` ends in `-direct`, `WT_SESSION` is set, or `TERM_PROGRAM`
is iTerm.app, WezTerm or ghostty; `ansi256` when `TERM` contains
`256color`; and `ansi16` otherwise.

```ts
import { detectColorLevel } from '@osdlc/ux'

detectColorLevel({ env: { TERM: 'xterm-256color' }, isTTY: true }) // 'ansi256'
detectColorLevel({ env: { NO_COLOR: '1' }, isTTY: true }) // 'none'
detectColorLevel({ env: { FORCE_COLOR: '3' }, isTTY: false }) // 'truecolor'
detectColorLevel({ env: { NO_COLOR: '1', FORCE_COLOR: '1' }, isTTY: true }) // 'none'
detectColorLevel({ env: {}, isTTY: true, override: false }) // 'none'
```

### Terminal colors

- `ansiColors(level, theme)` gives `AnsiCodes` for every token: `fg` sets
  the text color and `bg` the background. Both are empty strings at `none`.
  Pick the theme that matches the terminal's background.
- `ansiCodes(color, level)` gives the codes for any color: `38;2;r;g;b` at
  truecolor, `38;5;n` at 256 (the nearest of indexes 16-255), `30`-`37` or
  `90`-`97` at 16 (the nearest basic color). Backgrounds use `48` and
  `40`-`47` or `100`-`107`.
- `paint(text, codes, layer)` wraps `text` in the `fg` code, or the `bg`
  code with `layer` `'bg'`, then `ANSI_FG_RESET` (`ESC[39m`) or
  `ANSI_BG_RESET` (`ESC[49m`). It resets only that layer, so it nests in
  bold or other styles. With an empty code it returns `text` unchanged.
- `nearestAnsi256(color)` and `nearestAnsi16(color)` give the palette index
  nearest a color by sRGB distance (`colorDistance` from `@osdlc/color`).
  `ANSI256_PALETTE` and `ANSI16_PALETTE` hold the xterm default values they
  search. The 256 search skips indexes 0-15, which the user may have
  changed.

At 16 colors, `ansiColors` does not search. Each token takes its chosen
color from `ansi16`. A terminal's 16 colors are set by the user, so their
values are unknown, and the nearest of xterm's defaults picks the wrong hue
for some tokens: the light warning comes out red, and the dark success and
error come out gray. Status colors are green, yellow and red in both themes.

```ts
import { ansiCodes, ansiColors, paint } from '@osdlc/ux'

ansiColors('ansi256', 'dark')['status-error'].fg // '\x1b[38;5;210m'
ansiColors('ansi16', 'dark')['status-error'].fg // '\x1b[31m'
ansiCodes('#6a9bff', 'truecolor').fg // '\x1b[38;2;106;155;255m'
paint('failed', ansiColors('none', 'dark')['status-error']) // 'failed'
```

### Untrusted text

- `stripControls(text, options)` removes every terminal control, so printing
  the result cannot move the cursor, change colors, set the window title,
  write the clipboard or send any other command. It removes whole escape
  sequences (CSI, and the OSC, DCS, SOS, PM and APC strings up to BEL or ST,
  or to the end of the text when there is no terminator), their 8-bit C1
  forms, every other C0 and C1 control, DEL, and the bidirectional
  controls (the marks `U+061C`, `U+200E` and `U+200F`, and the embedding,
  override and isolate controls `U+202A`-`U+202E` and `U+2066`-`U+2069`). `StripControlsOptions` keeps line feeds
  (`newline: true`) or tabs (`tab: true`). A carriage return is always
  removed.
- `displayWidth(text)` counts terminal columns per grapheme cluster: 2 for
  East Asian wide and fullwidth characters and emoji, 0 for combining marks
  and format characters such as a zero-width joiner, and 1 for the rest,
  East Asian ambiguous characters included. Controls left in the text, a
  tab among them, count 0, because a tab's width depends on where it
  starts. Replace tabs with spaces before you measure.
- `fitWidth(text, width, options)` cuts `text` to at most `width` columns
  and ends cut text in an ellipsis inside the width. The cut falls between
  grapheme clusters, so a combining mark stays with its letter and a wide
  character is never split. `FitWidthOptions` sets the `ellipsis` (default
  `…`, `''` for none) and `pad`, which pads with spaces to exactly `width`.
  An ellipsis wider than `width` is dropped.

Strip first, then fit: `fitWidth` expects one line with no controls or tabs.

```ts
import { displayWidth, fitWidth, stripControls } from '@osdlc/ux'

stripControls('a\x1b]52;c;cm0gLXJmIH4=\x07b') // 'ab': the clipboard write is gone
stripControls('one\r\ntwo', { newline: true }) // 'one\ntwo'
displayWidth('日本é') // 5
fitWidth('日本語テキスト', 6) // '日本…'
fitWidth('ok', 4, { pad: true }) // 'ok  '
```

### Errors

There is no error class. Every message starts with `ux:`.

- `cssSheet` throws a `RangeError` for a prefix that is not lower-case
  letters, digits and `-`, starting with a letter.
- `detectColorLevel` throws a `RangeError` for an `override` string that is
  not a level. `ansiCodes` and `ansiColors` do the same for `level`.
- `fitWidth` throws a `RangeError` when `width` is not a non-negative
  integer.
- `ansiCodes`, `nearestAnsi16` and `nearestAnsi256` throw the `Error` of
  `@osdlc/color` for a color string it cannot read.

Each export has TSDoc in the source, with `@throws`. Your editor shows it.

## Dependencies

- `@osdlc/color`, for contrast and the sRGB distance. This package does no
  color arithmetic of its own.
- [`get-east-asian-width`](https://github.com/sindresorhus/get-east-asian-width),
  for the width of a character. It has no dependencies, and its tables are
  generated from the Unicode data file, so they follow new Unicode versions.
  A table written here would have to be kept up to date by hand.
  [`string-width`](https://github.com/sindresorhus/string-width) does the
  whole column count, but it brings `strip-ansi` and `emoji-regex` for jobs
  this package does itself: controls are removed by `stripControls`, and
  emoji are found with the Unicode `Emoji_Presentation` property. Grapheme
  clusters come from `Intl.Segmenter`, built into Node.js.

## How it compares

- [supports-color](https://github.com/chalk/supports-color) detects the
  level from the process itself. `detectColorLevel` takes the environment,
  TTY state and flag as arguments, and it honours `NO_COLOR`, which
  supports-color leaves to the caller.
- [strip-ansi](https://github.com/chalk/strip-ansi) removes the escape
  sequences that color and move text. `stripControls` also removes the
  other C0 and C1 controls, DEL and the bidirectional controls, so its
  output is safe to print as well as to measure.
- [string-width](https://github.com/sindresorhus/string-width) and
  [cli-truncate](https://github.com/sindresorhus/cli-truncate) measure and
  cut text, and keep ANSI codes. `fitWidth` expects plain text.
- Style Dictionary and similar token tools build tokens for many platforms
  from JSON. This package ships one fixed set as code.

## Stability

The package is at 0.x. A minor version may change any export, and its
CHANGELOG entry starts with `Breaking:` and says what to change. The token
values may change in any version to fix contrast or match a design change;
the token names change only in a minor version.

The experimental exports:

- none

## Runtimes and platforms

Node.js 22 or later, ESM only. The code reads no globals, no file system and
no process state: `detectColorLevel` takes the environment as an argument.
It needs `Intl.Segmenter`, which Node.js and current browsers have. The
built package is tested on Node.js 22 and 24, on Linux and macOS.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).
