import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, parse, resolve } from 'node:path'
import {
  ASSET_MANIFEST,
  assetManifestReader,
  buildAssetIndex,
  writeAssetManifest,
} from './assets.ts'
import type { MarkdownVaultAstroConfig } from './config.ts'
import type { CopyOp } from './markdown.ts'
import { rewriteFile } from './rewrite.ts'
import { isInside, walkFiles } from './walk.ts'
import { listMarkdown as listMarkdownIn } from './wikilink-ref.ts'
import type { Direction } from './rewrite.ts'

export interface RunStats {
  direction: Direction
  files: number
  assetsCopied: number
  assetsMissing: string[]
  byCollection: Record<string, number>
}

/** Options for {@link transform} and {@link exportVault}. */
export interface RunOptions {
  /** Print per-step progress. */
  verbose?: boolean
  /** Resolve targets but write nothing. */
  dryRun?: boolean
  /** Delete the destination collection/vault dir before writing; skipped when the source has no notes. */
  clean?: boolean
  /**
   * Keep a note? Called with its collection, collection-relative path and
   * rewritten text. A rejected note is not written and its assets are not copied.
   */
  include?: (collection: string, rel: string, text: string) => boolean
}

const listMarkdown = (dir: string): string[] => (existsSync(dir) ? listMarkdownIn(dir) : [])

function collectionDirs(
  config: MarkdownVaultAstroConfig,
  direction: Direction,
  col: MarkdownVaultAstroConfig['collections'][number],
): [src: string, dst: string] {
  const vaultSide = resolve(config.vault, col.vaultDir)
  const astroSide = resolve(config.astroRoot, col.contentDir)
  return direction === 'toAstro' ? [vaultSide, astroSide] : [astroSide, vaultSide]
}

/** `realpath` of `path`, or of its nearest existing ancestor plus the rest when it does not exist yet. */
function realish(path: string): string {
  const p = resolve(path)
  try {
    return realpathSync.native(p)
  } catch {
    const parent = dirname(p)
    return parent === p ? p : join(realish(parent), basename(p))
  }
}

/** True when `file` resolves to somewhere under `dir`; a file removed since the walk is not. */
function reachesInto(dir: string, file: string): boolean {
  try {
    return isInside(dir, realpathSync.native(file))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

/**
 * Refuse `--clean` when deleting `dst` would delete more than the collection:
 * notes in `src` (the two are the same or nested once links are resolved, or a
 * file the walk of `src` reaches lives inside `dst`), or a directory that is,
 * or contains, the vault, the Astro project, an asset directory, the working
 * directory, the home directory or a filesystem root, or that is a git root.
 */
function assertCleanSafe(config: MarkdownVaultAstroConfig, src: string, dst: string): void {
  const realSrc = realish(src)
  const realDst = realish(dst)
  const nested = isInside(realSrc, realDst) || isInside(realDst, realSrc)
  if (nested || (existsSync(src) && walkFiles(src).some((f) => reachesInto(realDst, f.full)))) {
    throw new Error(`--clean refused: ${src} and ${dst} are the same or nested (links resolved)`)
  }
  const protectedDirs = [
    config.vault,
    config.astroRoot,
    resolve(config.astroRoot, config.assets.publicDir),
    resolve(config.vault, config.assets.vaultDir),
    process.cwd(),
    homedir(),
  ].map(realish)
  const guarded = protectedDirs.some((p) => isInside(realDst, p))
  if (guarded || realDst === parse(realDst).root || existsSync(join(realDst, '.git'))) {
    throw new Error(
      `--clean refused: ${dst} is, or contains, the vault, the Astro project, an asset directory, the working directory or the home directory`,
    )
  }
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

/** Core engine shared by `transform` (toAstro) and `exportVault` (toVault). */
function run(config: MarkdownVaultAstroConfig, direction: Direction, opts: RunOptions): RunStats {
  const log = (msg: string) => {
    if (opts.verbose) console.log(msg)
  }

  // Copy roots. toAstro: assets live anywhere in the vault, so the source root
  // is the vault root (embeds are resolved to vault-relative paths). toVault:
  // pull from the published public dir into the vault's attachment folder.
  const copySrcRoot =
    direction === 'toAstro' ? config.vault : resolve(config.astroRoot, config.assets.publicDir)
  const copyDstRoot =
    direction === 'toAstro'
      ? resolve(config.astroRoot, config.assets.publicDir)
      : resolve(config.vault, config.assets.vaultDir)

  const assetIndex =
    direction === 'toAstro' ? buildAssetIndex(config.vault, config.assets.vaultDir) : undefined
  // toVault: the transform's manifest says where each media embed was published.
  const mediaPath =
    direction === 'toVault'
      ? assetManifestReader(resolve(config.astroRoot, ASSET_MANIFEST))
      : undefined

  const stats: RunStats = {
    direction,
    files: 0,
    assetsCopied: 0,
    assetsMissing: [],
    byCollection: {},
  }
  const copies = new Map<string, CopyOp>()
  const missing = new Set<string>()
  const assets = new Map<string, string>()

  // Checked before anything is deleted, so a bad collection cannot leave a half-cleaned tree.
  if (opts.clean && !opts.dryRun) {
    for (const col of config.collections) {
      const [src, dst] = collectionDirs(config, direction, col)
      assertCleanSafe(config, src, dst)
    }
  }

  for (const col of config.collections) {
    const [srcDir, dstDir] = collectionDirs(config, direction, col)

    const files = listMarkdown(srcDir)
    if (!files.length) {
      log(`  · ${col.name}: no files in ${srcDir}`)
      // A missing or empty source never cleans: a wrong path or a fresh clone would wipe the output.
      if (opts.clean && existsSync(dstDir) && listMarkdown(dstDir).length) {
        console.warn(`${col.name}: --clean skipped, ${srcDir} has no notes; ${dstDir} kept`)
      }
      continue
    }

    if (opts.clean && !opts.dryRun && existsSync(dstDir)) {
      rmSync(dstDir, { recursive: true, force: true })
    }

    for (const rel of files) {
      const text = readFileSync(join(srcDir, rel), 'utf8')
      const res = rewriteFile(text, {
        direction,
        publicBase: config.assets.publicBase,
        frontmatterAssets: config.frontmatterAssets,
        ...(assetIndex ? { assetIndex } : {}),
        ...(mediaPath ? { mediaPath } : {}),
      })
      if (opts.include && !opts.include(col.name, rel, res.text)) continue
      for (const c of res.copies) copies.set(`${c.srcRel}\u0000${c.destRel}`, c)
      res.missing.forEach((m) => missing.add(m))
      for (const [target, outSub] of Object.entries(res.assets)) assets.set(target, outSub)

      if (!opts.dryRun) {
        const outPath = join(dstDir, rel)
        ensureDir(join(outPath, '..'))
        writeFileSync(outPath, res.text)
      }
      stats.files += 1
      stats.byCollection[col.name] = (stats.byCollection[col.name] ?? 0) + 1
    }
    log(`  · ${col.name}: ${stats.byCollection[col.name] ?? 0} files`)
  }

  // Copy only the assets actually referenced, preserving sub-paths.
  const failed = new Set<string>()
  for (const c of copies.values()) {
    const from = join(copySrcRoot, c.srcRel)
    // A `..` in a published URL must not reach outside the copy roots.
    if (
      !isInside(copySrcRoot, from) ||
      !isInside(copyDstRoot, join(copyDstRoot, c.destRel)) ||
      !existsSync(from)
    ) {
      missing.add(c.srcRel)
      failed.add(c.destRel)
      continue
    }
    if (!opts.dryRun) {
      const to = join(copyDstRoot, c.destRel)
      ensureDir(join(to, '..'))
      copyFileSync(from, to)
    }
    stats.assetsCopied += 1
  }

  // The build reads this to point each media embed at its copy. Only files
  // that were copied are listed, so the rest render as missing attachments.
  // Nothing produced (wrong or empty vault) keeps the previous manifest, like the clean guard.
  if (direction === 'toAstro' && !opts.dryRun && stats.files > 0) {
    for (const [target, outSub] of assets) if (failed.has(outSub)) assets.delete(target)
    writeAssetManifest(resolve(config.astroRoot, ASSET_MANIFEST), assets)
  }

  stats.assetsMissing = [...missing]
  return stats
}

/** Map an Obsidian vault into Astro content collections (the build input). */
export function transform(config: MarkdownVaultAstroConfig, opts: RunOptions = {}): RunStats {
  return run(config, 'toAstro', opts)
}

/**
 * Export existing Astro content collections back into a canonical vault.
 *
 * @experimental Outside the stable API; it may change in a minor release.
 */
export function exportVault(config: MarkdownVaultAstroConfig, opts: RunOptions = {}): RunStats {
  return run(config, 'toVault', opts)
}
