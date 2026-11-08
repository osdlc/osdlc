/**
 * Scheme checks for the URLs a *note* gets to choose.
 *
 * The sanitizer polices `href` and `src` with its own `protocols` allowlist,
 * and nothing polices `data-*`. That gap matters because the dialect carries
 * the same URL twice: `href` for the browser and `data-path` /
 * `data-embed-path` for the host app, which reads it back and acts on it
 * (routes, `window.open`, `loadNote`). A `javascript:` target loses its `href`
 * to the sanitizer and keeps its `data-path`, so the host ends up navigating
 * to a string the sanitizer had already rejected.
 *
 * So the check lives here instead, and gets applied at both ends: where the
 * pipeline writes those attributes, and where the Vue layer reads them back —
 * raw HTML can forge an anchor or a `<markdown-embed>` the pipeline never
 * produced, and by then the two are indistinguishable.
 */

/** Schemes a note may send the host to. */
const LINK_SCHEMES = new Set(['http', 'https', 'mailto'])

/**
 * Schemes an `<img>`/`<video>`/`<audio>` src may use. `blob:` is here because
 * that is what a host's `assetUrl` hands back for a vault attachment it has
 * already fetched.
 */
const ASSET_SCHEMES = new Set(['http', 'https', 'blob'])

/** A scheme token, per RFC 3986. */
const SCHEME_TOKEN = /^[A-Za-z][A-Za-z0-9+.-]*$/

/**
 * The URL as a browser will see it. Tabs and newlines are stripped wherever
 * they appear and leading C0 controls / spaces are trimmed before parsing, so
 * `java\nscript:alert(1)` navigates as `javascript:alert(1)`. Normalizing
 * first is what keeps that from walking straight past a scheme check.
 */
function normalize(value: string): string {
  return value.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+/, '')
}

/**
 * The scheme a URL declares, lowercased, or `undefined` when it declares none
 * (i.e. it is relative). Mirrors `hast-util-sanitize`'s rule — a colon after
 * the first `/`, `?` or `#` is not a scheme — and additionally requires the
 * prefix to be a well-formed scheme token, since a malformed one is not a
 * scheme to a browser either.
 */
export function urlScheme(value: string): string | undefined {
  const url = normalize(value)
  const colon = url.indexOf(':')
  if (colon < 0) return undefined
  for (const mark of ['/', '?', '#']) {
    const at = url.indexOf(mark)
    if (at > -1 && at < colon) return undefined
  }
  const scheme = url.slice(0, colon)
  if (!SCHEME_TOKEN.test(scheme)) return undefined
  return scheme.toLowerCase()
}

function isSafe(value: unknown, schemes: Set<string>): boolean {
  if (typeof value !== 'string' || !value) return false
  const url = normalize(value)
  // `//host/path` carries no scheme but is still an off-site jump, and a vault
  // path never looks like that. Under a special base scheme (http/https — what
  // a note is ever rendered at) the WHATWG parser treats a leading backslash
  // as a slash, so `/\host`, `\\host` and `\/host` all resolve off-site
  // exactly as `//host` does. Compare on a slash-normalized copy so every
  // spelling is refused, and keep `url` itself unchanged — the scheme rule
  // below reads `:` position, which backslashes do not move.
  if (url.slice(0, 2).replace(/\\/g, '/') === '//') return false
  const scheme = urlScheme(url)
  return scheme === undefined ? true : schemes.has(scheme)
}

/**
 * Is this something a note may point a link at — `http:`, `https:`, `mailto:`,
 * or a path relative to the host's own origin?
 */
export function isSafeLinkPath(value: unknown): boolean {
  return isSafe(value, LINK_SCHEMES)
}

/** Is this something a note may point an `<img>`/`<video>`/`<audio>` at? */
export function isSafeAssetUrl(value: unknown): boolean {
  return isSafe(value, ASSET_SCHEMES)
}
