// Reads the crates.io sparse index. It needs no token.
// Used by crates-io-auth-plan.mjs and semver-version-check.mjs.

/** The sparse-index path of a crate name, per the cargo registry index format. */
function indexPath(name) {
  const n = name.toLowerCase()
  if (n.length <= 2) return `${n.length}/${n}`
  if (n.length === 3) return `3/${n[0]}/${n}`
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n}`
}

/**
 * Every published version of `name` as `{ vers, yanked }`, or null when the
 * crate is not on crates.io.
 */
export async function indexEntries(name) {
  const res = await fetch(`https://index.crates.io/${indexPath(name)}`, {
    headers: { 'User-Agent': 'osdlc-release-plz (https://github.com/osdlc/osdlc)' },
    signal: AbortSignal.timeout(30_000),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`crates.io index returned ${res.status} for ${name}`)
  return (await res.text())
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const { vers, yanked } = JSON.parse(l)
      return { vers, yanked: yanked === true }
    })
}

/**
 * True when `pkg` (a `cargo metadata` package) may be published to crates.io.
 * `publish` is null when unset, [] for `publish = false`, or a registry list.
 */
export const publishesToCratesIo = (pkg) => pkg.publish === null || pkg.publish.includes('crates-io')
