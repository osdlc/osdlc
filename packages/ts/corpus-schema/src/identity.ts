/**
 * Identity in the corpus-schema spec's Identity section (packages/conformance/corpus-schema/SPEC.md):
 * a packaged corpus, its types and its records are named by package URLs (purl,
 * https://github.com/package-url/purl-spec).
 */

/**
 * The parts of a package URL. Each is given unencoded.
 *
 * @experimental
 */
export interface PackageUrl {
  /** The package type, such as `npm` or `github`. */
  type: string
  /** The namespace's segments: an npm scope with its `@`, or a GitHub owner. */
  namespace?: string[]
  name: string
  version?: string
  /** The subpath's segments: a type folder, then a record id. */
  subpath?: string[]
}

/** `s` percent-encoded as one purl component: every character but A-Z a-z 0-9 . - _ ~ and :. */
const encode = (s: string): string =>
  encodeURIComponent(s)
    .replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%3A/g, ':')

/**
 * The package URL for `p`, in the purl spec's canonical form. A `github` namespace and name are
 * lowercased, as that type's definition says. Empty, `.` and `..` subpath segments are dropped.
 *
 * @experimental
 */
export function packageUrl(p: PackageUrl): string {
  const fold = (s: string): string => (p.type === 'github' ? s.toLowerCase() : s)
  const path = [...(p.namespace ?? []), p.name].map((s) => encode(fold(s))).join('/')
  const version = p.version === undefined ? '' : `@${encode(p.version)}`
  const sub = (p.subpath ?? []).filter((s) => s !== '' && s !== '.' && s !== '..')
  return `pkg:${p.type.toLowerCase()}/${path}${version}${sub.length > 0 ? `#${sub.map(encode).join('/')}` : ''}`
}

/**
 * The package URL of the npm package `name`, such as `@osdlc/corpus-profile-sdlc`, with an
 * optional version and subpath. For a corpus, a type and a record:
 *
 *   npmPackageUrl('@osdlc/corpus-sdlc-starter')                         pkg:npm/%40osdlc/corpus-sdlc-starter
 *   npmPackageUrl('@osdlc/corpus-sdlc-starter', '0.1.0', ['principles'])
 *     pkg:npm/%40osdlc/corpus-sdlc-starter@0.1.0#principles
 *   npmPackageUrl('@osdlc/corpus-sdlc-starter', undefined, ['principles', 'P-0002'])
 *     pkg:npm/%40osdlc/corpus-sdlc-starter#principles/P-0002
 *
 * @experimental
 */
export function npmPackageUrl(name: string, version?: string, subpath?: string[]): string {
  const slash = name.startsWith('@') ? name.indexOf('/') : -1
  return packageUrl({
    type: 'npm',
    ...(slash > 0 ? { namespace: [name.slice(0, slash)], name: name.slice(slash + 1) } : { name }),
    ...(version === undefined ? {} : { version }),
    ...(subpath === undefined ? {} : { subpath }),
  })
}
