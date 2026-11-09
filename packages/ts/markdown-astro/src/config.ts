import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { parse } from 'yaml'

import { isInside } from './walk.ts'

export interface CollectionMapping {
  /** Collection name (matches Astro `collections` key). */
  name: string
  /** Folder inside the vault that holds this collection's notes. */
  vaultDir: string
  /** Astro content directory the notes are written to, relative to astroRoot. */
  contentDir: string
  /**
   * Route template for build-time [[wikilink]] resolution, e.g.
   * `/posts/:slug`. `null` (or omitted) means the collection has no page
   * route, so links to it render as a non-clickable relation span.
   */
  route?: string | null
  /**
   * Short identifier used as the `type` prefix in typed `[[type/slug]]`
   * wikilinks (e.g. `"health"`, `"event"`). A typed prefix selects this
   * collection deterministically, bypassing first-match-by-config-order. Omit
   * for collections that are not the target of typed foreign-key references.
   */
  type?: string
}

export interface AssetsConfig {
  /** Filesystem dir assets are written to (transform) / read from (export). */
  publicDir: string
  /** URL prefix used in rewritten markdown image `src` values. */
  publicBase: string
  /** Folder inside the vault that stores embedded assets. */
  vaultDir: string
}

/**
 * What a dangling typed wikilink-ref (`[[type/slug]]` whose target doesn't
 * exist) does at build time. `error` hard-fails the build naming the offending
 * link; `warn` degrades to a `wikilink-missing` span (the legacy behaviour).
 */
export type DanglingRefPolicy = 'error' | 'warn'

export interface MarkdownAstroConfig {
  /** Absolute path to the Astro project root (everything resolves from here). */
  astroRoot: string
  /** Absolute path to the Obsidian vault root. */
  vault: string
  assets: AssetsConfig
  /** Frontmatter keys whose value is a single asset reference (e.g. `cover`). */
  frontmatterAssets: string[]
  collections: CollectionMapping[]
  /** Build-time behaviour for dangling wikilink-refs. Default `error`. */
  danglingRefPolicy: DanglingRefPolicy
}

interface RawConfig {
  astroRoot?: string
  vault?: string
  assets?: Partial<AssetsConfig>
  frontmatterAssets?: string[]
  collections?: CollectionMapping[]
  danglingRefPolicy?: DanglingRefPolicy
}

/** The config file the CLI reads when `--config` is not given. */
export const DEFAULT_CONFIG_NAME = 'markdown-astro.config.yaml'

/** The default config path under `dir`. */
export function resolveDefaultConfig(dir: string = process.cwd()): string {
  return resolve(dir, DEFAULT_CONFIG_NAME)
}

/** What a caller can decide instead of the config file. */
export interface LoadConfigOptions {
  /**
   * The vault directory, absolute or relative to the working directory. Wins over the file's
   * `vault:` key; a host with its own vault lookup passes its answer here.
   */
  vault?: string
}

/**
 * Load and normalise the YAML config, resolving all paths to absolute. The vault is
 * `options.vault`, else the file's `vault:` (relative to `astroRoot`), else `<astroRoot>/vault`.
 */
export function loadConfig(
  configPath: string,
  options: LoadConfigOptions = {},
): MarkdownAstroConfig {
  const abs = isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath)
  const raw = (parse(readFileSync(abs, 'utf8')) ?? {}) as RawConfig
  const baseDir = dirname(abs)

  const astroRoot = resolve(baseDir, raw.astroRoot ?? '.')
  const vault =
    options.vault !== undefined
      ? resolve(process.cwd(), options.vault)
      : resolve(astroRoot, raw.vault ?? 'vault')

  const assets: AssetsConfig = {
    publicDir: raw.assets?.publicDir ?? 'public/assets',
    publicBase: raw.assets?.publicBase ?? '/assets',
    vaultDir: raw.assets?.vaultDir ?? '_attachments',
  }

  if (!assets.publicBase.replace(/\/+$/, '')) {
    throw new Error(`markdown-astro config: assets.publicBase must not be \`/\` or empty in ${abs}`)
  }

  if (!raw.collections?.length) {
    throw new Error(`markdown-astro config: no \`collections\` defined in ${abs}`)
  }
  validateConfig(raw, abs)
  rejectNestedDirs(raw.collections, 'vaultDir', vault, abs)
  rejectNestedDirs(raw.collections, 'contentDir', astroRoot, abs)

  return {
    astroRoot,
    vault,
    assets,
    frontmatterAssets: raw.frontmatterAssets ?? [],
    collections: raw.collections.map((c) => ({ route: null, ...c })),
    danglingRefPolicy: raw.danglingRefPolicy ?? 'error',
  }
}

/** Throw a message naming the field and the config file for a collection or policy of the wrong shape. */
function validateConfig(raw: RawConfig, configPath: string): void {
  const bad = (what: string): never => {
    throw new Error(`markdown-astro config: ${what} in ${configPath}`)
  }
  const collections: unknown = raw.collections
  if (!Array.isArray(collections)) return bad('`collections` must be a list')
  ;(collections as CollectionMapping[]).forEach((c, i) => {
    if (typeof c !== 'object' || c === null) bad(`collections[${i}] must be a mapping`)
    for (const key of ['name', 'vaultDir', 'contentDir'] as const) {
      if (typeof c[key] !== 'string' || !c[key]) {
        bad(`collections[${i}] needs a non-empty string \`${key}\``)
      }
    }
  })
  const policy = raw.danglingRefPolicy
  if (policy !== undefined && policy !== 'error' && policy !== 'warn') {
    bad(`danglingRefPolicy must be \`error\` or \`warn\`, got ${JSON.stringify(policy)}`)
  }
}

/** True when `a` and `b` are the same dir or one contains the other. */
function overlaps(a: string, b: string): boolean {
  return isInside(a, b) || isInside(b, a)
}

/**
 * Reject collections whose `key` dirs are equal or nested. `--clean` empties
 * each destination dir, which would delete another collection's notes inside it.
 */
function rejectNestedDirs(
  collections: CollectionMapping[],
  key: 'vaultDir' | 'contentDir',
  root: string,
  configPath: string,
): void {
  const dirs = collections
    .filter((c) => typeof c[key] === 'string')
    .map((c) => ({ name: c.name, dir: resolve(root, c[key]) }))
  for (const [i, a] of dirs.entries()) {
    for (const b of dirs.slice(i + 1)) {
      if (overlaps(a.dir, b.dir)) {
        throw new Error(
          `markdown-astro config: collections "${a.name}" and "${b.name}" have equal or nested ${key}s (${a.dir}, ${b.dir}) in ${configPath}`,
        )
      }
    }
  }
}
