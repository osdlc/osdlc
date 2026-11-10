/**
 * `katex` and `mermaid` are optional peers. A host that never renders math or
 * diagrams does not install them, and their dynamic imports then reject. The
 * loaders leave the rejection to the caller and record it here once per peer,
 * so a page of equations is one warning, not one per block.
 */

const warned = new Set<string>()

/** Does `err` say the module is absent, as opposed to present but failing to load? */
function isMissing(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return true
  return /cannot find (package|module)|failed to resolve import/i.test(
    err instanceof Error ? err.message : String(err ?? ''),
  )
}

/**
 * Warn once that a peer could not be imported. With no `err`, or an error that
 * says the module is absent, it reports "not installed"; any other failure (a
 * 404 on a chunk, a network error) reports the error instead, because that is
 * the only diagnostic the host sees.
 */
export function warnMissingPeer(name: string, effect: string, err?: unknown): void {
  if (warned.has(name)) return
  warned.add(name)
  const why =
    err === undefined || isMissing(err)
      ? 'is not installed'
      : `could not be loaded (${err instanceof Error ? err.message : String(err)})`
  console.warn(`@osdlc/markdown-render: ${name} ${why}; ${effect}`)
}
