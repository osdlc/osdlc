/** The pages a site has, as the params of its routes, and the record behind each. */
import type { Site, SiteRecord, SiteType } from './site.ts'

/** The path of a referenced corpus's record under `ref/`: `<corpus key>/<type>/<slug>`. */
const refPath = (record: SiteRecord): string =>
  `${record.corpus}/${record.type.slug}/${record.slug}`

/** The params of every type index page: `[type]`. */
export const typePaths = (site: Site): { params: { type: string } }[] =>
  site.types.map((type) => ({ params: { type: type.slug } }))

/** The params of every record page of the loaded corpus: `[type]/[record]`. */
export const recordPaths = (site: Site): { params: { type: string; record: string } }[] =>
  site
    .pages()
    .filter((record) => record.corpus === '')
    .map((record) => ({ params: { type: record.type.slug, record: record.slug } }))

/** The params of every record page of a referenced corpus: `ref/[...ref]`. */
export const refPaths = (site: Site): { params: { ref: string } }[] =>
  site
    .pages()
    .filter((record) => record.corpus !== '')
    .map((record) => ({ params: { ref: refPath(record) } }))

/** The type whose index page has the slug `slug`. */
export const typeBySlug = (site: Site, slug: string | undefined): SiteType | undefined =>
  site.types.find((type) => type.slug === slug)

/** The record of the loaded corpus whose page is `<type>/<record>`. */
export const recordBySlug = (
  site: Site,
  type: string | undefined,
  record: string | undefined,
): SiteRecord | undefined => {
  const siteType = typeBySlug(site, type)
  return siteType === undefined
    ? undefined
    : site.recordsOf(siteType).find((r) => r.slug === record)
}

/** The record of a referenced corpus whose page is `ref/<path>`. */
export const recordByRef = (site: Site, path: string | undefined): SiteRecord | undefined =>
  site.pages().find((record) => record.corpus !== '' && refPath(record) === path)
