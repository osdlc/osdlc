/**
 * Shared helpers for the Canvas component tests. Vitest's `include` covers
 * `.test.ts` files only, so a test written here would never be collected.
 */

/**
 * Canvas → client coordinates, read off the CSS variables the wrapper
 * publishes — the same numbers the component itself uses. Parsed out of the
 * raw style attribute because jsdom's inline-style API drops custom
 * properties.
 */
export function canvasToClient(host: HTMLElement, x: number, y: number) {
  const style = host.querySelector<HTMLElement>('.vjc-wrapper')!.getAttribute('style')!
  const varOf = (name: string) => {
    const match = style.match(new RegExp(`${name}:\\s*(-?[\\d.]+)`))
    if (!match) throw new Error(`${name} not found in wrapper style: ${style}`)
    return parseFloat(match[1]!)
  }
  const scale = varOf('--scale')
  return {
    clientX: x * scale + varOf('--pan-x'),
    clientY: y * scale + varOf('--pan-y'),
  }
}
