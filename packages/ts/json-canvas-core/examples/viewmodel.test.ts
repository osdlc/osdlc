// The view model: selection, zoom, pan and events, with no UI framework.
import { expect, test } from 'vitest'
import {
  CanvasViewModel,
  DEFAULT_CONFIG,
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_SPEED,
  mergeConfig,
  type ICanvasContent,
} from '@osdlc/json-canvas-core'

const canvas: ICanvasContent = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'a' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 100, height: 50, text: 'b' },
  ],
  edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
}

test('selection and events', () => {
  // #region selection
  const view = new CanvasViewModel(canvas)
  let changes = 0
  view.on('selectionChange', () => changes++)

  view.selectNode('a')
  view.selectNodes(['b'], true) // add to the selection
  expect([...view.selectedNodeIds]).toEqual(['a', 'b'])
  view.selectNodesInRect({ x: -10, y: -10, width: 120, height: 80 }) // adds 'a' again
  view.selectEdge('e') // clears the node selection
  view.clearSelection()
  // #endregion selection

  expect(changes).toBe(5)
  expect(view.selectedNodeIds.size).toBe(0)
  expect(view.selectedEdge).toBeNull()
  expect(view.selectAll().selectedNodes).toHaveLength(2)
  expect(view.toggleNodeSelection('a').isNodeSelected('a')).toBe(false)
})

test('zoom and pan', () => {
  // #region viewport
  const view = new CanvasViewModel(canvas)

  view.zoomIn().zoomIn()
  expect(view.zoomPercent).toEqual(120)
  view.setScale(99) // clamped to the configured maximum
  view.setPan(40, 20)
  // A click at screen (240, 120), in a container whose corner is at screen (0, 0):
  view.screenToCanvas(240, 120, 0, 0) // { x: (240 - 40) / 3, y: (120 - 20) / 3 }
  // #endregion viewport

  expect(view.scale).toBe(MAX_SCALE)
  expect(view.screenToCanvas(240, 120, 0, 0)).toEqual({ x: 200 / MAX_SCALE, y: 100 / MAX_SCALE })
  expect(new CanvasViewModel(canvas).zoomIn().zoomIn().zoomPercent).toBe(120)
  expect(ZOOM_SPEED).toBe(0.1)
  expect(new CanvasViewModel(canvas).setScale(0).scale).toBe(MIN_SCALE)
})

test('configuration', () => {
  // #region config
  const view = new CanvasViewModel(canvas, { minScale: 0.5, snapEnabled: false })

  expect(view.config.minScale).toEqual(0.5)
  expect(view.config.maxScale).toEqual(3) // from DEFAULT_CONFIG
  expect(mergeConfig({ zoomSpeed: 0.25 }).zoomSpeed).toEqual(0.25)
  // #endregion config

  expect(view.config.maxScale).toBe(DEFAULT_CONFIG.maxScale)
  expect(mergeConfig({ zoomSpeed: 0.25 }).zoomSpeed).toBe(0.25)
  expect(mergeConfig().resizeBoundary).toBe(DEFAULT_CONFIG.resizeBoundary)
})

test('a new canvas, for example after an undo', () => {
  // #region set-canvas
  const view = new CanvasViewModel(canvas).selectNode('b')
  let canvasChanges = 0
  view.on('canvasChange', () => canvasChanges++)

  // 'b' is not on the new canvas, so it leaves the selection.
  view.setCanvas({ nodes: [canvas.nodes[0]!], edges: [] })
  expect(view.selectedNodeIds.size).toEqual(0)
  // #endregion set-canvas

  expect(canvasChanges).toBe(1)
  expect(view.selectedNodeIds.size).toBe(0)
  expect(view.nodes).toHaveLength(1)
  expect(view.edges).toHaveLength(0)
})

test('queries: hit testing and bounding boxes', () => {
  // #region queries
  const view = new CanvasViewModel(canvas).selectNode('a')

  expect(view.findNodeAtPoint({ x: 10, y: 10 })?.id).toEqual('a')
  expect(view.getNodeBoundingBox()?.width).toEqual(400)
  expect(view.getSelectionBoundingBox()?.width).toEqual(100)
  // #endregion queries

  expect(view.findNodeAtPoint({ x: 10, y: 10 })?.id).toBe('a')
  expect(view.findNodeAtPoint({ x: 200, y: 200 })).toBeNull()
  expect(view.getNodeBoundingBox()?.width).toBe(400)
  expect(view.getSelectionBoundingBox()?.width).toBe(100)
})

test('experimental: resize and snap queries', () => {
  // #region experimental-queries
  const view = new CanvasViewModel(canvas).selectNode('a')

  view.getResizeDirectionForNode({ x: 99, y: 49 }, canvas.nodes[0]!) // 'se'
  // Dragging 'a' 195 right: it snaps 5 further, against the left edge of 'b'.
  expect(view.calculateSnapForDrag(195, 0).dx).toEqual(200)
  // #endregion experimental-queries

  expect(view.getResizeDirectionForNode({ x: 99, y: 49 }, canvas.nodes[0]!)).toBe('se')
  expect(view.calculateSnapForDrag(195, 0).dx).toBe(200)
  expect(
    new CanvasViewModel(canvas, { snapEnabled: false })
      .selectNode('a')
      .calculateSnapForDrag(195, 0),
  ).toEqual({
    dx: 195,
    dy: 0,
    guides: [],
  })
})
