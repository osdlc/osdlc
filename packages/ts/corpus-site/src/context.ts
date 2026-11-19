/**
 * The site of the running build. The integration builds it once and keeps it on `globalThis`,
 * so the pages, which Vite bundles apart from the integration, read the same object.
 */
import type { Site } from './site.ts'

/** What the integration keeps for the pages. */
export interface SiteContext {
  site: Site
}

const KEY = Symbol.for('@osdlc/corpus-site')
const store = globalThis as { [KEY]?: SiteContext }

/** Keep `context` for the pages. The integration calls this when it has loaded the corpus. */
export function setSiteContext(context: SiteContext): void {
  store[KEY] = context
}

/** The context of the running build. Throws outside a build or dev server that uses `corpusSite`. */
export function getSiteContext(): SiteContext {
  const context = store[KEY]
  if (context === undefined)
    throw new Error(
      '@osdlc/corpus-site: no site is loaded. Add corpusSite() to the integrations of astro.config.',
    )
  return context
}

/**
 * The site of the running build: the corpus, its types and records, and their addresses. Call
 * it from the frontmatter of an Astro page, or from `getStaticPaths`.
 */
export const getSite = (): Site => getSiteContext().site
