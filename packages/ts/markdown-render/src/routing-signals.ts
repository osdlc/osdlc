/**
 * What routes an element to a live component — in one place, because two
 * passes read it and a drift between them is a security hole.
 *
 * `vue/render.ts`'s `routeKeys` turns a signal into an override key.
 * `plugins/provenance.ts` strips every signal off an element the pipeline did
 * not produce. A note's raw HTML survives `rehype-raw` as real elements and
 * the sanitize schema deliberately allows the dialect's classes and `data-*`
 * attributes, so without the strip a hand-written `<div class="callout">`
 * reaches `Callout`, and a hand-written
 * `<a class="wikilink" data-path="…">` reaches `WikilinkAnchor` carrying
 * fields the note invented rather than fields a resolver produced.
 *
 * The consequence is deliberate: raw HTML spelling `<pre><code
 * class="language-ts">` is not highlighted, and a raw
 * `<div class="callout">` gets no callout styling. Routing and dialect chrome
 * are pipeline-produced only.
 *
 * Dependency-free on purpose. `provenance.ts` runs on the string-only path, so
 * it must not reach the table through an import that drags `vue` in with it.
 */

/**
 * A class name that routes an element of one tag to a component.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export interface ClassRoute {
  /** Tag the route applies to. */
  tag: string
  /** Class the pipeline stamps to reach the component. */
  className: string
  /** Override key `routeKeys` produces for it. */
  key: string
}

/**
 * Class routes, in the order `routeKeys` tries them — most specific first.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export const CLASS_ROUTES: readonly ClassRoute[] = [
  { tag: 'code', className: 'math-inline', key: 'math-inline' },
  { tag: 'a', className: 'wikilink', key: 'a.wikilink' },
  { tag: 'a', className: 'tag', key: 'a.tag' },
  { tag: 'div', className: 'callout', key: 'div.callout' },
]

/**
 * hast property naming a fence's language, and the `lang:<language>` route's
 * only input. `rehypeCodeMeta` stamps it before the raw pass; the Shiki pass
 * re-stamps it afterwards from the `<code>`'s `language-*` class — which is
 * why that class is a routing signal in its own right.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export const FENCE_LANG_PROP = 'dataLang'

/**
 * Classes stripped from an element the pipeline did not vouch for.
 *
 * Every {@link CLASS_ROUTES} class is here, and so is the family around it:
 * `callout-title`, `wikilink-missing` and `markdown-*` are chrome the pipeline
 * paints, not classes a note gets to claim. `language-*` is here because the
 * Shiki pass reads it to stamp {@link FENCE_LANG_PROP} long after provenance
 * has run, which would hand a forged fence a `lang:` route.
 *
 * Not tag-scoped: `class="tag"` on a `<span>` routes nowhere, but it is still
 * the dialect's own class and matching the whole family costs nothing.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export const STRIPPED_CLASSES: ReadonlyArray<string | RegExp> = [
  /^wikilink(-[a-z0-9-]+)?$/,
  'tag',
  /^callout(-[a-z0-9-]+)?$/,
  /^math-(inline|display)$/,
  /^language-\S+$/,
  /^markdown-[a-z0-9-]+$/,
]

/** hast properties stripped from an element the pipeline did not vouch for. */
export const STRIPPED_PROPERTIES: readonly string[] = [FENCE_LANG_PROP]

/** Class list from a hast element's properties, whatever shape `className` came in as. */
export function classNames(properties: Record<string, unknown> | undefined): string[] {
  const raw = properties?.className
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean)
  return []
}

/**
 * Is this class name one of the dialect's own?
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export function isRoutingClass(name: string): boolean {
  return STRIPPED_CLASSES.some((rule) =>
    typeof rule === 'string' ? rule === name : rule.test(name),
  )
}

/**
 * Does this element carry anything the router — or the Shiki pass — keys on?
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export function carriesRoutingSignal(properties: Record<string, unknown> | undefined): boolean {
  if (!properties) return false
  for (const name of STRIPPED_PROPERTIES) if (properties[name] !== undefined) return true
  if (properties.className === undefined) return false
  return classNames(properties).some(isRoutingClass)
}

/**
 * Remove every routing signal, in place. What is left keeps its tag, its text
 * and its non-routing attributes, and can no longer reach a component.
 *
 * @experimental A host contract for a self-assembled pipeline with no known user yet; it may change in a minor release.
 */
export function stripRoutingSignals(properties: Record<string, unknown>): void {
  for (const name of STRIPPED_PROPERTIES) delete properties[name]
  const raw = properties.className
  if (raw === undefined) return
  const kept = classNames(properties).filter((name) => !isRoutingClass(name))
  if (kept.length === 0) delete properties.className
  else properties.className = Array.isArray(raw) ? kept : kept.join(' ')
}
