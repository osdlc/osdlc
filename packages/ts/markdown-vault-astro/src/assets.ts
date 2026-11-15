import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { noteBasename as basename } from '@osdlc/markdown-render/plugins'
import { byCodeUnit, isMarkdown, walkFiles } from './walk.ts'

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

  if (existsSync(vaultRoot)) {
    for (const { rel } of walkFiles(vaultRoot)) {
      if (isMarkdown(rel)) continue
      allPaths.add(rel)
      const key = basename(rel).toLowerCase()
      ;(byBasename.get(key) ?? byBasename.set(key, []).get(key)!).push(rel)
    }
  }

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
export const ASSET_MANIFEST = '.markdown-vault-astro/assets.json'

/** Write the media manifest: embed target as written -> path under the public asset dir. */
export function writeAssetManifest(file: string, assets: Map<string, string>): void {
  const sorted = Object.fromEntries([...assets].sort(([a], [b]) => byCodeUnit(a, b)))
  mkdirSync(dirname(file), { recursive: true })
  // Written beside and renamed into place, so a reader never sees half a file.
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`)
  renameSync(tmp, file)
}

/** How long a reader answers from memory before it stats the manifest again. */
const MANIFEST_RECHECK_MS = 250

/**
 * Look a media embed target up in the manifest. The file is re-read when its
 * mtime, size or inode changes (the writer renames into place, so a rewrite
 * is a new inode even within one timestamp tick), so a long-lived `astro dev`
 * server sees media the transform copies after it started. The file is stat'ed
 * at most once per `recheckMs`, not once per lookup. A missing manifest
 * answers `null` for everything.
 */
export function assetManifestReader(
  file: string,
  { recheckMs = MANIFEST_RECHECK_MS }: { recheckMs?: number } = {},
): (target: string) => string | null {
  let loadedStamp = ''
  let checkedAt = -Infinity
  let present = false
  let assets: Record<string, string> = {}
  return (target) => {
    const now = Date.now()
    // `now < checkedAt` is a clock that stepped back: stat again.
    if (!(now - checkedAt < recheckMs && now >= checkedAt)) {
      checkedAt = now
      try {
        const st = statSync(file)
        present = true
        const stamp = `${st.mtimeMs}:${st.size}:${st.ino}`
        if (stamp !== loadedStamp) {
          try {
            assets = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
            loadedStamp = stamp
          } catch {
            assets = {} // unreadable now: answer nothing, and read again on the next check
            loadedStamp = ''
          }
        }
      } catch {
        present = false
      }
    }
    if (!present) return null
    return Object.hasOwn(assets, target) ? (assets[target] ?? null) : null
  }
}
