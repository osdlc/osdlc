/**
 * sRGB colour arithmetic.
 *
 * A colour is an {@link Rgba}: channels 0-255, alpha 0-1. Parsing accepts the
 * CSS syntaxes a browser reports. Mixing and compositing happen in
 * gamma-encoded sRGB. Contrast is the WCAG 2 relative luminance ratio.
 *
 * Errors: a colour that cannot be parsed, and a pixel with fewer than 4
 * entries, throw a plain `Error`. A number argument a function cannot use
 * throws a `RangeError`. Every message starts with `color:`.
 */

/**
 * A colour. Channels `r`, `g` and `b` are 0-255. `a` is 0-1.
 *
 * The fields are read-only, so a frozen object or an `as const` literal can be
 * passed in. Every function returns a new plain object, except that
 * {@link compositeOver} returns `src` itself when its alpha is exactly 1.
 * None changes its arguments.
 */
export interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

const HEX_RE = /^#([0-9a-f]{3,8})$/i
const FUNC_RE = /^rgba?\(([^)]*)\)$/i
const COLOR_SRGB_RE = /^color\(srgb\s+([^)]*)\)$/i
// A CSS number, optionally a percentage: `1`, `-2.5`, `.5`, `1e3`, `50%`.
const NUMBER_RE = /^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?%?$/i

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n))

function clampChannel(n: number): number {
  return clamp(Math.round(n), 255)
}

function unparseable(css: string): Error {
  return new Error(`color: unparseable colour '${css}'`)
}

/** One argument of `rgb()` or `color(srgb …)`. */
interface Arg {
  value: number
  pct: boolean
}

function readArg(part: string, css: string): Arg {
  if (!NUMBER_RE.test(part)) throw unparseable(css)
  const pct = part.endsWith('%')
  return { value: Number(pct ? part.slice(0, -1) : part), pct }
}

/**
 * Split a function's arguments into three channels and an optional alpha.
 * The modern form is `r g b` or `r g b / a`. The legacy form, allowed only
 * when `commas` is set, is `r, g, b` or `r, g, b, a`, with the three channels
 * all numbers or all percentages. Anything else throws, as a browser rejects
 * it.
 */
function readArgs(
  inner: string,
  css: string,
  commas: boolean,
): { rgb: [Arg, Arg, Arg]; alpha?: Arg } {
  const text = inner.trim()
  const legacy = text.includes(',')
  let rgbParts: string[]
  let alphaPart: string | undefined
  if (legacy) {
    if (!commas || text.includes('/')) throw unparseable(css)
    const parts = text.split(',').map((p) => p.trim())
    if (parts.length < 3 || parts.length > 4) throw unparseable(css)
    if (parts.some((p) => p === '' || /\s/.test(p))) throw unparseable(css)
    rgbParts = parts.slice(0, 3)
    alphaPart = parts[3]
  } else {
    const [channels, alpha, extra] = text.split('/')
    if (extra !== undefined) throw unparseable(css)
    rgbParts = channels!.split(/\s+/).filter((p) => p.length > 0)
    if (rgbParts.length !== 3) throw unparseable(css)
    if (alpha !== undefined) {
      alphaPart = alpha.trim()
      if (alphaPart === '' || /\s/.test(alphaPart)) throw unparseable(css)
    }
  }
  const rgb: [Arg, Arg, Arg] = [
    readArg(rgbParts[0]!, css),
    readArg(rgbParts[1]!, css),
    readArg(rgbParts[2]!, css),
  ]
  if (legacy && rgb.some((arg) => arg.pct !== rgb[0].pct)) throw unparseable(css)
  return alphaPart === undefined ? { rgb } : { rgb, alpha: readArg(alphaPart, css) }
}

/**
 * A channel argument, clamped to 0-255. `unit` is what a plain number 1 is
 * worth. A channel's 100% is 255 whatever the unit; an alpha's is 1.
 */
function channelOf(arg: Arg, unit: number): number {
  return clamp(arg.pct ? (arg.value / 100) * 255 : arg.value * unit, 255)
}

/** An alpha argument: a number 0-1 or a percentage, clamped to 0-1. */
function alphaOf(arg: Arg | undefined): number {
  if (arg === undefined) return 1
  return clamp(arg.pct ? arg.value / 100 : arg.value, 1)
}

/**
 * Parse a CSS colour into an {@link Rgba}.
 *
 * Accepts hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()` and `rgba()`
 * in the space form (`rgb(1 2 3 / 0.5)`) and the comma form
 * (`rgb(1, 2, 3, 0.5)`), and `color(srgb r g b [/ a])`. The last is what
 * `getComputedStyle` reports for a colour resolved through
 * `color-mix(in srgb, …)`. Its channels are 0-1 numbers or percentages,
 * scaled here to 0-255. Leading and trailing whitespace is ignored.
 *
 * Channels are clamped to 0-255 and alpha to 0-1. A browser clamps `rgb()` when
 * it computes the value. It keeps an out-of-range `color(srgb …)` as written,
 * so there the clamp is this function's choice. Channels are not rounded.
 *
 * @throws Error when the text is in another syntax or is malformed: a named
 * colour, `hsl()`, `none`, a hex of 5 or 7 digits, too few or too many
 * arguments, a non-numeric argument such as `12abc`, or commas mixed with
 * spaces or a slash. A colour the caller cannot resolve should fail, not
 * become a wrong number.
 */
export function parseColor(css: string): Rgba {
  const text = css.trim()
  const hex = HEX_RE.exec(text)
  if (hex) {
    const digits = hex[1]!
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = [...digits].map((d) => Number.parseInt(d + d, 16))
      return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 }
    }
    if (digits.length === 6 || digits.length === 8) {
      const pair = (i: number) => Number.parseInt(digits.slice(i, i + 2), 16)
      return {
        r: pair(0),
        g: pair(2),
        b: pair(4),
        a: digits.length === 8 ? pair(6) / 255 : 1,
      }
    }
    throw new Error(`color: unsupported hex colour '${css}'`)
  }
  const colorSrgb = COLOR_SRGB_RE.exec(text)
  if (colorSrgb) {
    const {
      rgb: [r, g, b],
      alpha,
    } = readArgs(colorSrgb[1]!, css, false)
    return { r: channelOf(r, 255), g: channelOf(g, 255), b: channelOf(b, 255), a: alphaOf(alpha) }
  }
  const func = FUNC_RE.exec(text)
  if (func) {
    const {
      rgb: [r, g, b],
      alpha,
    } = readArgs(func[1]!, css, true)
    return { r: channelOf(r, 1), g: channelOf(g, 1), b: channelOf(b, 1), a: alphaOf(alpha) }
  }
  throw new Error(`color: unsupported colour syntax '${css}'`)
}

/**
 * Format as `#rrggbb`, or `#rrggbbaa` when the alpha is below 1. Each channel,
 * and the alpha scaled to 0-255, is rounded to an integer and clamped to
 * 0-255. It does not throw.
 */
export function formatHex(color: Rgba): string {
  const hex = (n: number) => clampChannel(n).toString(16).padStart(2, '0')
  const rgb = `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`
  if (color.a >= 1) return rgb
  return `${rgb}${hex(color.a * 255)}`
}

/**
 * Blend `amount` (0-1) of `overlay` into `base`, per channel and alpha, in
 * sRGB. An `amount` below 0 or above 1 is clamped.
 *
 * For opaque colours this is `color-mix(in srgb, base, overlay <amount>%)`,
 * with `amount` as a percentage. For translucent colours it differs, because
 * `color-mix` premultiplies by alpha.
 *
 * @throws RangeError when `amount` is `NaN` or infinite.
 */
export function mixColors(base: Rgba, overlay: Rgba, amount: number): Rgba {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`color: mixColors amount must be a finite number, got ${amount}`)
  }
  const t = clamp(amount, 1)
  const lerp = (x: number, y: number) => x + (y - x) * t
  return {
    r: lerp(base.r, overlay.r),
    g: lerp(base.g, overlay.g),
    b: lerp(base.b, overlay.b),
    a: lerp(base.a, overlay.a),
  }
}

/**
 * Replace a colour's alpha and keep its channels. An `alpha` below 0 or above
 * 1 is clamped.
 *
 * @throws RangeError when `alpha` is `NaN` or infinite.
 */
export function withAlpha(color: Rgba, alpha: number): Rgba {
  if (!Number.isFinite(alpha)) {
    throw new RangeError(`color: withAlpha alpha must be a finite number, got ${alpha}`)
  }
  return { ...color, a: clamp(alpha, 1) }
}

/**
 * Convert a `[r, g, b, a]` pixel, the layout of `ImageData.data` with alpha
 * 0-255, into an {@link Rgba} with alpha 0-1. Entries after the fourth are
 * ignored.
 *
 * @throws Error when `px` has fewer than 4 entries.
 */
export function fromPixel(px: ArrayLike<number>): Rgba {
  if (px.length < 4) throw new Error(`color: a pixel needs 4 channels, got ${px.length}`)
  return { r: px[0]!, g: px[1]!, b: px[2]!, a: px[3]! / 255 }
}

/**
 * Paint `src` over an opaque `ground` (source-over, straight alpha) and return
 * the opaque result.
 *
 * Contrast is a property of painted pixels, and a colour with alpha never
 * paints its own channels. Each mixed channel is rounded to 8 bits, as a
 * browser paints it. A Chromium 2D canvas gives the same pixel to within one
 * step per channel, because it also rounds the alpha to 8 bits and blends in
 * integers. A `src` whose alpha is exactly 1 is returned as is. A finite alpha
 * outside 0-1 is clamped first, as {@link withAlpha} clamps it, so 2 gives a
 * new object with `a: 1` and -1 gives the ground's channels.
 *
 * @throws RangeError when `ground.a` is below 1 or `NaN`. A translucent ground
 * shows what is under it, which this function does not know. Composite the
 * ground over its own background first.
 * @throws RangeError when `src.a` is `NaN` or infinite.
 */
export function compositeOver(src: Rgba, ground: Rgba): Rgba {
  if (!(ground.a >= 1)) {
    throw new RangeError(`color: compositeOver needs an opaque ground, got alpha ${ground.a}`)
  }
  if (!Number.isFinite(src.a)) {
    throw new RangeError(`color: compositeOver needs a finite source alpha, got ${src.a}`)
  }
  if (src.a === 1) return src
  const a = clamp(src.a, 1)
  if (a === 1) return { r: src.r, g: src.g, b: src.b, a: 1 }
  const mix = (s: number, g: number) => Math.round(s * a + g * (1 - a))
  return { r: mix(src.r, ground.r), g: mix(src.g, ground.g), b: mix(src.b, ground.b), a: 1 }
}

/**
 * WCAG 2 relative luminance, 0-1. Alpha is ignored, so composite a
 * translucent colour first. It does not throw.
 */
export function relativeLuminance(color: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/**
 * WCAG 2 contrast ratio between two colours, 1-21. Either side may be an
 * {@link Rgba} or a CSS string for {@link parseColor}. Alpha is ignored, so
 * composite a translucent colour first.
 *
 * @throws Error when a string side cannot be parsed, as {@link parseColor}
 * throws.
 */
export function contrastRatio(a: Rgba | string, b: Rgba | string): number {
  const ca = typeof a === 'string' ? parseColor(a) : a
  const cb = typeof b === 'string' ? parseColor(b) : b
  const la = relativeLuminance(ca)
  const lb = relativeLuminance(cb)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Euclidean distance between two colours in gamma-encoded sRGB, over the
 * 0-255 channels: 0 for the same colour, about 441.7 for black to white.
 * Alpha is ignored. It is the measure for picking the nearest colour of a
 * fixed palette, such as a terminal's 256 colours. It is not a perceptual
 * difference.
 *
 * @throws Error when a string side cannot be parsed, as {@link parseColor}
 * throws.
 */
export function colorDistance(a: Rgba | string, b: Rgba | string): number {
  const ca = typeof a === 'string' ? parseColor(a) : a
  const cb = typeof b === 'string' ? parseColor(b) : b
  return Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b)
}
