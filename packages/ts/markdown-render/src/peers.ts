/**
 * `katex` and `mermaid` are optional peers. A host that never renders math or
 * diagrams does not install them, and their dynamic imports then reject. The
 * loaders leave the rejection to the caller and record it here once per peer,
 * so a page of equations is one warning, not one per block.
 */

const warned = new Set<string>()

export function warnMissingPeer(name: string, effect: string): void {
  if (warned.has(name)) return
  warned.add(name)
  console.warn(`@osdlc/markdown-render: ${name} is not installed; ${effect}`)
}
