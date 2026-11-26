import type { INode } from '../types.ts'
import type { BoundingBox, SnapGuide, SnapResult } from './types.ts'

/**
 * Floor tolerance for "these two snap diffs describe the same alignment": the
 * gap between them is only floating-point noise, not a real difference.
 */
const DIFF_EPSILON = 1e-6

/**
 * Past this coordinate magnitude one ulp exceeds DIFF_EPSILON, so the
 * tolerance has to grow with the coordinates or real matches read as different.
 * A few ulps of headroom, still far below any usable snap threshold.
 */
const DIFF_ULPS = 8

/** True when two snap diffs taken near `magnitude` are the same alignment. */
function isSameDiff(a: number, b: number, magnitude: number): boolean {
  const tolerance = Math.max(DIFF_EPSILON, DIFF_ULPS * Number.EPSILON * Math.abs(magnitude))
  return Math.abs(a - b) <= tolerance
}

/** Drop every guide on one axis; the delta they described has been overridden. */
function dropGuides(guides: SnapGuide[], type: SnapGuide['type']): void {
  for (let i = guides.length - 1; i >= 0; i--) {
    if (guides[i]?.type === type) guides.splice(i, 1)
  }
}

/**
 * Calculate snap adjustments for a dragged bounding box.
 *
 * Checks alignment against target nodes and returns adjusted deltas
 * along with visual snap guides to display.
 *
 * Each axis keeps only the guides that describe the delta actually returned:
 * a later target node that overrides an axis's delta discards that axis's
 * earlier guides, so every returned guide is a line the dragged bounds really
 * land on. Surviving guides stay in target-node order.
 *
 * @param dragBounds - Bounding box of the elements being dragged
 * @param targetNodes - Nodes to snap against (excluding dragged nodes)
 * @param dx - Proposed horizontal delta
 * @param dy - Proposed vertical delta
 * @param threshold - Snap threshold in canvas coordinates
 * @returns Adjusted deltas and snap guides
 */
export function calculateSnap(
  dragBounds: BoundingBox,
  targetNodes: INode[],
  dx: number,
  dy: number,
  threshold: number,
): SnapResult {
  const guides: SnapGuide[] = []
  // The diff behind snappedDx / snappedDy, or null while that axis has no snap.
  let vDiff: number | null = null
  let hDiff: number | null = null
  let snappedDx = dx
  let snappedDy = dy

  // Projected bounds after applying delta
  const projLeft = dragBounds.left + dx
  const projRight = dragBounds.right + dx
  const projCenterX = dragBounds.centerX + dx
  const projTop = dragBounds.top + dy
  const projBottom = dragBounds.bottom + dy
  const projCenterY = dragBounds.centerY + dy

  for (const node of targetNodes) {
    // Vertical snap targets (affects horizontal position)
    const vTargets = [
      { proj: projLeft, target: node.x, align: 'edge' as const },
      {
        proj: projRight,
        target: node.x + node.width,
        align: 'edge' as const,
      },
      {
        proj: projLeft,
        target: node.x + node.width,
        align: 'edge' as const,
      },
      { proj: projRight, target: node.x, align: 'edge' as const },
      {
        proj: projCenterX,
        target: node.x + node.width / 2,
        align: 'center' as const,
      },
    ]

    for (const v of vTargets) {
      const diff = v.target - v.proj
      if (Math.abs(diff) < threshold) {
        snappedDx = dx + diff
        if (vDiff === null || !isSameDiff(diff, vDiff, v.target)) {
          // This node moved the delta, so the earlier vertical guides no
          // longer describe where the dragged bounds land.
          dropGuides(guides, 'vertical')
        }
        vDiff = diff
        if (!guides.some((g) => g.type === 'vertical' && Math.abs(g.position - v.target) < 1)) {
          guides.push({
            type: 'vertical',
            position: v.target,
            alignment: v.align,
          })
        }
        break
      }
    }

    // Horizontal snap targets (affects vertical position)
    const hTargets = [
      { proj: projTop, target: node.y, align: 'edge' as const },
      {
        proj: projBottom,
        target: node.y + node.height,
        align: 'edge' as const,
      },
      {
        proj: projTop,
        target: node.y + node.height,
        align: 'edge' as const,
      },
      { proj: projBottom, target: node.y, align: 'edge' as const },
      {
        proj: projCenterY,
        target: node.y + node.height / 2,
        align: 'center' as const,
      },
    ]

    for (const h of hTargets) {
      const diff = h.target - h.proj
      if (Math.abs(diff) < threshold) {
        snappedDy = dy + diff
        if (hDiff === null || !isSameDiff(diff, hDiff, h.target)) {
          dropGuides(guides, 'horizontal')
        }
        hDiff = diff
        if (!guides.some((g) => g.type === 'horizontal' && Math.abs(g.position - h.target) < 1)) {
          guides.push({
            type: 'horizontal',
            position: h.target,
            alignment: h.align,
          })
        }
        break
      }
    }
  }

  return { dx: snappedDx, dy: snappedDy, guides }
}
