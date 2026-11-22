/** A side of a node, where an edge attaches. */
export type Direction = 'left' | 'right' | 'top' | 'bottom'

/** The end of an edge: no marker, or an arrowhead. */
export type MarkerType = 'none' | 'arrow'

/** The kind of a node. It decides which extra properties the node has. */
export type NodeType = 'text' | 'file' | 'link' | 'group'

/** How a group node's background image fills the group. */
export type BackgroundStyle = 'cover' | 'ratio' | 'repeat'

/**
 * A preset colour, written as the string `'1'` to `'6'`. The JSON Canvas spec
 * leaves the shades to the renderer: `Colors` holds this package's choice.
 */
export type PresetColor = '1' | '2' | '3' | '4' | '5' | '6'

enum ColorEnum {
  RED = '#ef4444',
  ORANGE = '#f97316',
  YELLOW = '#eab308',
  GREEN = '#22c55e',
  CYAN = '#06b6d4',
  PURPLE = '#a855f7',
}

/**
 * The CSS colour of each preset: `'1'` red, `'2'` orange, `'3'` yellow, `'4'`
 * green, `'5'` cyan and `'6'` purple.
 */
export const Colors: Record<PresetColor, string> = {
  '1': ColorEnum.RED,
  '2': ColorEnum.ORANGE,
  '3': ColorEnum.YELLOW,
  '4': ColorEnum.GREEN,
  '5': ColorEnum.CYAN,
  '6': ColorEnum.PURPLE,
}

/**
 * Resolves a preset (`'1'` to `'6'`) to its CSS colour from `Colors`. Any other
 * value, a hex colour for one, comes back as it is. `undefined` and the empty
 * string give `undefined`.
 */
export function resolveColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  if (color in Colors) {
    return Colors[color as PresetColor]
  }
  return color
}

/** The properties every node has, whatever its type. */
export interface IBaseNode {
  /** Unique within the canvas. */
  id: string
  type: NodeType
  /** Left edge, in canvas units. */
  x: number
  /** Top edge, in canvas units. */
  y: number
  /** Width, in canvas units. Positive. */
  width: number
  /** Height, in canvas units. Positive. */
  height: number
  /** A preset (`'1'` to `'6'`) or a hex colour such as `#ff8800`. */
  color?: PresetColor | string
}

/** A node that holds text, written as Markdown. */
export interface ITextNode extends IBaseNode {
  type: 'text'
  /** The Markdown text. */
  text: string
}

/** A node that points at a file in the host application's storage. */
export interface IFileNode extends IBaseNode {
  type: 'file'
  /** Path of the file, as the host application reads it. */
  file: string
  /** A heading or block inside the file. Starts with `#`. */
  subpath?: string
}

/** A node that points at a URL. */
export interface ILinkNode extends IBaseNode {
  type: 'link'
  url: string
}

/**
 * A node that visually contains others. The format records no membership:
 * a node is in a group when it lies inside the group's bounds.
 */
export interface IGroupNode extends IBaseNode {
  type: 'group'
  label?: string
  /** Path of a background image. */
  background?: string
  backgroundStyle?: BackgroundStyle
}

/** Any node. Narrow it on `type`, or with `isTextNode` and its siblings. */
export type INode = ITextNode | IFileNode | ILinkNode | IGroupNode

// =============================================================================
// New Node Types (for creation operations - id is optional)
// =============================================================================

/** Text node for creation: `id` is optional and generated if absent. */
export type NewTextNode = Omit<ITextNode, 'id'> & { id?: string }

/**
 * File node without required id (for creation).
 */
export type NewFileNode = Omit<IFileNode, 'id'> & { id?: string }

/**
 * Link node without required id (for creation).
 */
export type NewLinkNode = Omit<ILinkNode, 'id'> & { id?: string }

/**
 * Group node without required id (for creation).
 */
export type NewGroupNode = Omit<IGroupNode, 'id'> & { id?: string }

/** Kept a union of per-type shapes so `type` still discriminates which properties are valid. */
export type NewNode = NewTextNode | NewFileNode | NewLinkNode | NewGroupNode

// =============================================================================
// Node Update Types (for update operations - partial properties)
// =============================================================================

/**
 * Base properties that can be updated on any node.
 */
type NodeUpdateBase = Partial<Pick<IBaseNode, 'x' | 'y' | 'width' | 'height' | 'color'>>

/**
 * Update properties for text nodes.
 */
export type TextNodeUpdate = NodeUpdateBase & { text?: string }

/**
 * Update properties for file nodes.
 */
export type FileNodeUpdate = NodeUpdateBase & {
  file?: string
  subpath?: string
}

/**
 * Update properties for link nodes.
 */
export type LinkNodeUpdate = NodeUpdateBase & { url?: string }

/**
 * Update properties for group nodes.
 */
export type GroupNodeUpdate = NodeUpdateBase & {
  label?: string
  background?: string
  backgroundStyle?: BackgroundStyle
}

/** The properties an `updateNode` operation may change, for any node type. */
export type NodeUpdate = TextNodeUpdate | FileNodeUpdate | LinkNodeUpdate | GroupNodeUpdate

/** An edge between two nodes. */
export interface IEdge {
  /** Unique within the canvas. */
  id: string
  /** Id of the node the edge starts at. */
  fromNode: string
  fromSide?: Direction
  /** Marker at the start. The spec default is `'none'`. */
  fromEnd?: MarkerType
  /** Id of the node the edge ends at. */
  toNode: string
  toSide?: Direction
  /** Marker at the end. The spec default is `'arrow'`. */
  toEnd?: MarkerType
  label?: string
  /** A preset (`'1'` to `'6'`) or a hex colour such as `#ff8800`. */
  color?: PresetColor | string
}

/**
 * A whole canvas: the document a `.canvas` file holds. Both arrays are
 * required here, though the spec makes them optional. Pass untrusted data
 * through `validateCanvasData` and `normalizeCanvas` to get one.
 */
export interface ICanvasContent {
  nodes: INode[]
  edges: IEdge[]
}

/** True when the node is a text node. */
export function isTextNode(node: INode): node is ITextNode {
  return node.type === 'text'
}

/** True when the node is a file node. */
export function isFileNode(node: INode): node is IFileNode {
  return node.type === 'file'
}

/** True when the node is a link node. */
export function isLinkNode(node: INode): node is ILinkNode {
  return node.type === 'link'
}

/** True when the node is a group node. */
export function isGroupNode(node: INode): node is IGroupNode {
  return node.type === 'group'
}

/**
 * Sorts nodes so groups render below other nodes, per the JSON Canvas spec.
 * Preserves relative order within each category.
 */
export function sortNodesForRendering(nodes: INode[]): INode[] {
  const groups: INode[] = []
  const others: INode[] = []

  for (const node of nodes) {
    if (isGroupNode(node)) {
      groups.push(node)
    } else {
      others.push(node)
    }
  }

  // Groups first (rendered below), then others (rendered above)
  return [...groups, ...others]
}
