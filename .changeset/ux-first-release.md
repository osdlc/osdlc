---
'@osdlc/ux': minor
---

First release. Design tokens for a tool's web page and terminal UI, as data: colors for light and dark, radii and fonts, with every text and background pair at WCAG AA in both themes. `cssSheet()` and `tokensCss` give a sheet of CSS custom properties that follows `prefers-color-scheme` and an explicit `data-theme`, also shipped as `@osdlc/ux/tokens.css`. `detectColorLevel()` decides whether a stream gets color, and how many colors, from `NO_COLOR`, `FORCE_COLOR`, `TERM`, `COLORTERM`, the TTY state and a `--color`/`--no-color` override. `ansiColors()` gives each token's escape sequences at that level. `stripControls()` removes every terminal control from untrusted text, and `fitWidth()` cuts a line to a number of columns, counting wide characters and combining marks.
