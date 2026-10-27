/** The tokens as a sheet of CSS custom properties. */

import { COLOR_TOKENS, colors, fonts, radii, type Palette } from './tokens.ts'

/** Options for {@link cssSheet}. */
export interface CssSheetOptions {
  /**
   * The custom-property prefix: `ux` gives `--ux-bg-base`. Lower-case
   * letters, digits and `-`, starting with a letter. Default `ux`.
   */
  readonly prefix?: string
}

const PREFIX = /^[a-z][a-z0-9-]*$/

/**
 * A CSS sheet that declares every token as a custom property on `:root`.
 *
 * - Light colors, radii and fonts are declared on `:root`.
 * - Dark colors apply under `prefers-color-scheme: dark`, unless the root
 *   element has `data-theme="light"`.
 * - `data-theme="dark"` applies the dark colors whatever the system setting,
 *   and `data-theme="light"` keeps the light ones.
 * - `color-scheme` follows the same rules, so form controls and scrollbars
 *   match.
 *
 * Names are `--<prefix>-<token>` for colors, `--<prefix>-radius-<name>` and
 * `--<prefix>-font-<name>`.
 *
 * @throws RangeError when `prefix` is empty or has a character other than
 * lower-case letters, digits and `-`, or does not start with a letter.
 */
export function cssSheet(options: CssSheetOptions = {}): string {
  const prefix = options.prefix ?? 'ux'
  if (!PREFIX.test(prefix)) {
    throw new RangeError(`ux: prefix ${JSON.stringify(prefix)} is not [a-z][a-z0-9-]*`)
  }
  const decl = (indent: string, name: string, value: string) =>
    `${indent}--${prefix}-${name}: ${value};`
  const palette = (p: Palette, indent: string) =>
    COLOR_TOKENS.map((t) => decl(indent, t, p[t])).join('\n')
  return [
    ':root {',
    '  color-scheme: light dark;',
    palette(colors.light, '  '),
    ...Object.entries(radii).map(([k, v]) => decl('  ', `radius-${k}`, v)),
    ...Object.entries(fonts).map(([k, v]) => decl('  ', `font-${k}`, v)),
    '}',
    '@media (prefers-color-scheme: dark) {',
    "  :root:not([data-theme='light']) {",
    palette(colors.dark, '    '),
    '  }',
    '}',
    '/* An explicit choice wins over the system setting in both directions. */',
    ":root[data-theme='dark'] {",
    '  color-scheme: dark;',
    palette(colors.dark, '  '),
    '}',
    ":root[data-theme='light'] {",
    '  color-scheme: light;',
    '}',
    '',
  ].join('\n')
}

/** {@link cssSheet} with the default `ux` prefix. The package also ships it as `@osdlc/ux/tokens.css`. */
export const tokensCss: string = cssSheet()
