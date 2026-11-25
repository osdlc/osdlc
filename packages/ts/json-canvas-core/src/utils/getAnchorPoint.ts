import type { Direction } from '../types.ts'

/** Arrow offset to ensure arrowheads don't get hidden behind nodes */
const ARROW_OFFSET = 2

/**
 * The part of a positioned element `getAnchorPoint` reads. A browser's
 * `HTMLElement` with inline `left` and `top` fits it. The core names no DOM
 * type, so it builds and runs with no DOM.
 */
export interface PositionedBox {
  style: { left: string; top: string }
  offsetWidth: number
  offsetHeight: number
}

/** A node's anchor point on the given side, offset outward so arrows connect perpendicular. */
export function getAnchorPoint(node: PositionedBox, side: Direction): { x: number; y: number } {
  // parseFloat, not parseInt: left/top are fractional at most zoom levels.
  const x = parseFloat(node.style.left)
  const y = parseFloat(node.style.top)
  const width = node.offsetWidth
  const height = node.offsetHeight

  switch (side) {
    case 'top':
      return { x: x + width / 2, y: y - ARROW_OFFSET }
    case 'right':
      return { x: x + width + ARROW_OFFSET, y: y + height / 2 }
    case 'bottom':
      return { x: x + width / 2, y: y + height + ARROW_OFFSET }
    case 'left':
      return { x: x - ARROW_OFFSET, y: y + height / 2 }
    default: // center or unspecified case
      return { x: x + width / 2, y: y + height / 2 }
  }
}
