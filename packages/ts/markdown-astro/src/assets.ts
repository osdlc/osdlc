import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { basename } from './markdown.ts'

interface AssetRef {
  /** Path of the asset relative to the vault root (the copy source). */
  vaultPath: string
  /** Path under the site's public asset base (the copy dest + URL tail). */
  outSub: string
  /** False when the embed could not be matched to a real file in the vault. */
  resolved: boolean
}

export interface AssetIndex {
  /** Resolve an embed target (a path or a bare basename) to a concrete asset. */
  resolve(target: string): AssetRef
}

/**
 * Index every non-markdown file in the vault so embeds can be resolved the way
 * Obsidian resolves them — by explicit vault-relative path OR by bare basename
 * found anywhere in the vault. Assets under `vaultAssetDir` (e.g. `_attachments`)
 * map to a flat URL (the prefix is stripped, unless a file outside the asset
 * dir already has the stripped path); assets elsewhere keep their
 * vault-relative sub-path, so `images/diagram.png` → `/base/images/diagram.png`.
 * When the stripped path is another asset's too (`_attachments/x.png` beside a
 * vault-root `x.png`), the `vaultAssetDir` asset keeps its full path, so no two
 * assets share a URL.
 */
export function buildAssetIndex(vaultRoot: string, vaultAssetDir: string): AssetIndex {
  const byBasename = new Map<string, string[]>()
  const allPaths = new Set<string>()

  // Real paths of the directories being walked, so a symlink back to one of
  // them is not followed again.
  const ancestors = new Set<string>()
  const walk = (dir: string, prefix: string): void => {
    let real: string
    let names: string[]
    try {
      real = realpathSync(dir)
      names = readdirSync(dir)
    } catch {
      // Unreadable, or gone since it was listed. Skipped like an entry that
      // cannot be stat'ed.
      return
    }
    if (ancestors.has(real)) return
    ancestors.add(real)
    for (const name of names) {
      if (name.startsWith('.')) continue // skip .obsidian, .git, etc.
      const full = join(dir, name)
      const rel = prefix ? `${prefix}/${name}` : name
      let isDir: boolean
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        // Cannot stat it, e.g. a dangling symlink. Skipped without a word; an
        // embed of it is reported later as a missing copy.
        continue
      }
      if (isDir) walk(full, rel)
      else if (!name.endsWith('.md')) {
        allPaths.add(rel)
        const key = name.toLowerCase()
        ;(byBasename.get(key) ?? byBasename.set(key, []).get(key)!).push(rel)
      }
    }
    ancestors.delete(real)
  }
  if (existsSync(vaultRoot)) walk(vaultRoot, '')

  const assetPrefix = `${vaultAssetDir.replace(/\/+$/, '')}/`
  const outSubs = new Map<string, string>()
  for (const rel of allPaths) {
    outSubs.set(rel, rel.startsWith(assetPrefix) ? rel.slice(assetPrefix.length) : rel)
  }
  // Each pass reverts at least one stripped path to its full, unique one, so this ends.
  for (let changed = true; changed;) {
    changed = false
    const claims = new Map<string, number>()
    for (const sub of outSubs.values()) claims.set(sub, (claims.get(sub) ?? 0) + 1)
    for (const [rel, sub] of outSubs) {
      if (sub !== rel && claims.get(sub)! > 1) {
        outSubs.set(rel, rel)
        changed = true
      }
    }
  }
  const toOutSub = (rel: string): string => outSubs.get(rel) ?? rel
  const found = (rel: string): AssetRef => ({
    vaultPath: rel,
    outSub: toOutSub(rel),
    resolved: true,
  })

  return {
    resolve(target: string): AssetRef {
      const clean = target.split('#')[0]!.replace(/^\.\//, '').trim()
      // 1. exact vault-relative path
      if (allPaths.has(clean)) return found(clean)
      // 2. a path under the asset dir written without its prefix, the way
      //    export-vault writes it (the inverse of toOutSub)
      if (allPaths.has(assetPrefix + clean)) return found(assetPrefix + clean)
      // 3. basename found anywhere. A written directory part picks the files
      //    whose path ends with it, as Obsidian does; among the rest, prefer
      //    one already under _attachments.
      const cands = byBasename.get(basename(clean).toLowerCase())
      if (cands && cands.length) {
        const lower = clean.toLowerCase()
        const bySuffix = clean.includes('/')
          ? cands.filter((p) => {
              const l = p.toLowerCase()
              return l === lower || l.endsWith(`/${lower}`)
            })
          : []
        const pool = bySuffix.length ? bySuffix : cands
        return found(pool.find((p) => p.startsWith(assetPrefix)) ?? pool[0]!)
      }
      // 4. unresolved — assume the conventional _attachments location so the URL
      //    is still sensible and run() reports the missing copy.
      const base = basename(clean)
      return { vaultPath: `${assetPrefix}${base}`, outSub: base, resolved: false }
    },
  }
}

/**
 * Where the transform records which file each media embed resolved to,
 * relative to the Astro root. The build-time remark plugin reads it, so the
 * placement rule above runs once, in the transform.
 */
export const ASSET_MANIFEST = '.markdown-astro/assets.json'

/** Write the media manifest: embed target as written -> path under the public asset dir. */
export function writeAssetManifest(file: string, assets: Map<string, string>): void {
  const sorted = Object.fromEntries([...assets].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`)
}

/**
 * Look a media embed target up in the manifest. The file is re-read whenever
 * it changes, so a long-lived `astro dev` server sees media the transform
 * copies after it started. A missing manifest answers `null` for everything.
 */
export function assetManifestReader(file: string): (target: string) => string | null {
  let loadedAt = -1
  let assets: Record<string, string> = {}
  return (target) => {
    let mtime: number
    try {
      mtime = statSync(file).mtimeMs
    } catch {
      return null
    }
    if (mtime !== loadedAt) {
      try {
        assets = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
      } catch {
        assets = {}
      }
      loadedAt = mtime
    }
    return Object.hasOwn(assets, target) ? (assets[target] ?? null) : null
  }
}
