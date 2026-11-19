import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
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
  /** Output files that were new, i.e. not in the destination before the run. */
  added: number
  /** Output files whose text differs from the destination's copy. */
  changed: number
  /** `--clean`: destination files with no counterpart in the new build; deleted by a real run (only with `yes`). */
  removed: string[]
  /** Without `--clean`: destination files with no counterpart in the new build; left in place. */
  orphans: string[]
}

/** Options for {@link transform} and {@link exportVault}. */
export interface RunOptions {
  /** Print per-step progress. */
  verbose?: boolean
  /** Resolve targets but write nothing. */
  dryRun?: boolean
  /**
   * Replace the destination collection/vault dir with a fresh build: built
   * aside in a sibling dir, then swapped in; skipped when the source has no
   * notes. A real run that would remove destination files with no counterpart
   * in the build throws, naming them, unless `yes` is set.
   */
  clean?: boolean
  /** Let `clean` remove destination files that have no counterpart in the build. */
  yes?: boolean
  /**
   * Keep a note? Called with its collection, collection-relative path and
   * rewritten text. A rejected note is not written and its assets are not copied.
   */
  include?: (collection: string, rel: string, text: string) => boolean
}

/** Suffix of the sibling directory a `--clean` build is written to before it replaces the destination. */
const TMP_SUFFIX = '.markdown-vault-astro-tmp'
const OLD_SUFFIX = '.markdown-vault-astro-old'

/** Every file under `dir` (dot files included, links not followed), as `/`-separated relative paths. */
function listAllFiles(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name
    if (ent.isDirectory()) out.push(...listAllFiles(join(dir, ent.name), rel))
    else out.push(rel)
  }
  return out
}

/** A run killed between the two renames of {@link swapIn} leaves the previous output only in `<dst>.markdown-vault-astro-old`; put it back. */
function recoverInterruptedSwap(dst: string): void {
  const old = `${dst}${OLD_SUFFIX}`
  if (existsSync(old) && !existsSync(dst)) renameSync(old, dst)
}

/** Put the built `tmp` dir in place of `dst`; `dst` is restored if the move fails, deleted only after it succeeds. */
function swapIn(dst: string, tmp: string): void {
  const old = `${dst}${OLD_SUFFIX}`
  rmSync(old, { recursive: true, force: true })
  const hadDst = existsSync(dst)
  if (hadDst) renameSync(dst, old)
  try {
    renameSync(tmp, dst)
  } catch (err) {
    if (hadDst) renameSync(old, dst)
    throw err
  }
  rmSync(old, { recursive: true, force: true })
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
    added: 0,
    changed: 0,
    removed: [],
    orphans: [],
  }
  const swapClean = Boolean(opts.clean && !opts.dryRun)
  const staged: Array<{ dst: string; tmp: string }> = []
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

  try {
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

      // A --clean build goes to a sibling dir, so a run that fails partway leaves dstDir as it was.
      const outDir = swapClean ? `${dstDir}${TMP_SUFFIX}` : dstDir
      if (swapClean) {
        recoverInterruptedSwap(dstDir)
        rmSync(outDir, { recursive: true, force: true })
        staged.push({ dst: dstDir, tmp: outDir })
      }
      const existing = new Set(listAllFiles(dstDir))
      const built = new Set<string>()

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

        built.add(rel)
        if (!existing.has(rel)) stats.added += 1
        else if (readFileSync(join(dstDir, rel), 'utf8') !== res.text) stats.changed += 1

        if (!opts.dryRun) {
          const outPath = join(outDir, rel)
          ensureDir(join(outPath, '..'))
          writeFileSync(outPath, res.text)
        }
        stats.files += 1
        stats.byCollection[col.name] = (stats.byCollection[col.name] ?? 0) + 1
      }
      const unmatched = [...existing]
        .filter((rel) => !built.has(rel))
        .map((rel) => join(dstDir, rel))
      if (opts.clean) stats.removed.push(...unmatched)
      else {
        stats.orphans.push(...unmatched)
        if (unmatched.length) {
          console.warn(
            `${col.name}: ${unmatched.length} file(s) in ${dstDir} have no source; --clean would remove them`,
          )
        }
      }
      log(`  · ${col.name}: ${stats.byCollection[col.name] ?? 0} files`)
    }

    if (swapClean && stats.removed.length && !opts.yes) {
      throw new Error(
        `--clean would remove ${stats.removed.length} file(s) with no source; nothing was changed. Pass --yes to remove them, or --dry-run for the report:\n${stats.removed.map((f) => `  ${f}`).join('\n')}`,
      )
    }
  } catch (err) {
    for (const { tmp } of staged) rmSync(tmp, { recursive: true, force: true })
    throw err
  }
  try {
    for (const { dst, tmp } of staged) swapIn(dst, tmp)
  } finally {
    for (const { tmp } of staged) rmSync(tmp, { recursive: true, force: true })
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
