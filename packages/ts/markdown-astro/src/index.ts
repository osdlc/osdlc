import { resolve } from 'node:path'
import { ASSET_MANIFEST } from './assets.ts'
import { loadConfig } from './config.ts'
import type { LoadConfigOptions, MarkdownAstroConfig } from './config.ts'
import { remarkWikilinks } from './remark-wikilinks.ts'
import type { RemarkWikilinksOptions, WikilinkCollection } from './remark-wikilinks.ts'

export { loadConfig, resolveDefaultConfig, DEFAULT_CONFIG_NAME } from './config.ts'
export { ASSET_MANIFEST } from './assets.ts'
export type {
  MarkdownAstroConfig,
  CollectionMapping,
  AssetsConfig,
  DanglingRefPolicy,
  LoadConfigOptions,
} from './config.ts'
export { transform, exportVault } from './run.ts'
export type { RunOptions, RunStats } from './run.ts'
export { remarkWikilinks } from './remark-wikilinks.ts'
export type { EmbedAssets, RemarkWikilinksOptions, WikilinkCollection } from './remark-wikilinks.ts'
export { rewriteFile } from './rewrite.ts'
export type { Direction, FileRewriteResult, RewriteOptions } from './rewrite.ts'
export { slugify } from './slug.ts'
export { resolveRef, buildRefIndex, wikilinkRef, pathKey } from './wikilink-ref.ts'
export type { RefIndex, IndexedCollection } from './wikilink-ref.ts'

/**
 * Convenience for `astro.config`: build the remark plugin straight from the
 * shared YAML config so the same collection list and asset dirs drive both
 * the file transform and build-time link and embed rendering. `vault`, like
 * {@link loadConfig}'s option of that name, wins over the file's `vault:` key.
 */
export function remarkWikilinksFromConfig(
  configPath: string,
  overrides: Partial<RemarkWikilinksOptions> & LoadConfigOptions = {},
): [typeof remarkWikilinks, RemarkWikilinksOptions] {
  const { vault, ...pluginOverrides } = overrides
  const config = loadConfig(configPath, vault === undefined ? {} : { vault })
  const options: RemarkWikilinksOptions = {
    collections: toWikilinkCollections(config),
    danglingRefPolicy: config.danglingRefPolicy,
    assets: {
      manifest: resolve(config.astroRoot, ASSET_MANIFEST),
      publicBase: config.assets.publicBase,
    },
    ...pluginOverrides,
  }
  // Return a unified `[attacher, options]` tuple so the markdown pipeline calls
  // the attacher itself (NOT the transformer it returns).
  return [remarkWikilinks, options]
}

function toWikilinkCollections(config: MarkdownAstroConfig): WikilinkCollection[] {
  return config.collections.map((c) => ({
    name: c.name,
    dir: resolve(config.astroRoot, c.contentDir),
    vaultDir: c.vaultDir,
    route: c.route ?? null,
    ...(c.type ? { type: c.type } : {}),
  }))
}
