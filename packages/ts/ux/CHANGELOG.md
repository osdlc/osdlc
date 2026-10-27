# @osdlc/ux

## 0.1.1

### Patch Changes

- b835ae4: New `controlPattern(options)`: a global `RegExp` that matches, one character at a time, the control characters `stripControls` removes with the same options, for a filter that must keep the text's length. `stripControls` checks each character against the same set.

## 0.1.0

### Minor Changes

- 9616994: First release. Design tokens for a tool's web page and terminal UI, as data: colors for light and dark, radii and fonts, with every pair in `CONTRAST_PAIRS` (each text color on each background, and the accent label on the accent) at WCAG AA in both themes. `cssSheet()` and `tokensCss` give a sheet of CSS custom properties that follows `prefers-color-scheme` and an explicit `data-theme`, also shipped as `@osdlc/ux/tokens.css`. `detectColorLevel()` decides whether a stream gets color, and how many colors, from `NO_COLOR`, `FORCE_COLOR`, `TERM`, `COLORTERM`, the TTY state and a `--color`/`--no-color` override. The override wins over every variable, and `NO_COLOR` wins over `FORCE_COLOR`. `ansiColors()` gives each token's escape sequences at that level. `stripControls()` removes every terminal control from untrusted text, and `fitWidth()` cuts a line to a number of columns, counting wide characters and combining marks.

### Patch Changes

- Updated dependencies [9616994]
  - @osdlc/color@1.1.0
