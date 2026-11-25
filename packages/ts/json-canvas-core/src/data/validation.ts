import type {
  BackgroundStyle,
  Direction,
  ICanvasContent,
  MarkerType,
  NodeType,
  PresetColor,
} from '../types.ts'

// ============================================================================
// Validation Result Types
// ============================================================================

/** One problem `validateCanvasData` found in the input. */
export interface ValidationError {
  /** Where the problem is, for example `nodes[0].x` or `edges[1].fromNode`. Empty for the root. */
  path: string
  /** What is wrong, for a person to read. */
  message: string
  /** What is wrong, for a program to branch on. */
  code: ValidationErrorCode
}

/**
 * The kind of a validation problem. A minor release may add values, so a
 * `switch` over it needs a `default` branch.
 */
export type ValidationErrorCode =
  | 'MISSING_REQUIRED'
  | 'INVALID_TYPE'
  | 'INVALID_VALUE'
  | 'DUPLICATE_ID'
  | 'INVALID_REFERENCE'
  | 'INVALID_FORMAT'

/** The outcome of `validateCanvasData`. */
export interface ValidationResult {
  /** True when `errors` is empty. */
  valid: boolean
  errors: ValidationError[]
  /** Reserved. Validation reports every problem as an error, so this is always empty. */
  warnings: ValidationError[]
}

// ============================================================================
// Valid Values
// ============================================================================

const VALID_NODE_TYPES: NodeType[] = ['text', 'file', 'link', 'group']
const VALID_DIRECTIONS: Direction[] = ['top', 'right', 'bottom', 'left']
const VALID_MARKER_TYPES: MarkerType[] = ['none', 'arrow']
const VALID_BACKGROUND_STYLES: BackgroundStyle[] = ['cover', 'ratio', 'repeat']
const VALID_PRESET_COLORS: PresetColor[] = ['1', '2', '3', '4', '5', '6']

// ============================================================================
// Helper Functions
// ============================================================================

function createError(path: string, message: string, code: ValidationErrorCode): ValidationError {
  return { path, message, code }
}

/** True for a 3-digit (`#RGB`) or 6-digit (`#RRGGBB`) hex colour string. */
export function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color)
}

/** True for a preset (`'1'` to `'6'`) or a hex colour. An absent colour (`undefined`) is valid; the empty string is not. */
export function isValidColor(color: string | undefined): boolean {
  if (color === undefined) return true
  if (VALID_PRESET_COLORS.includes(color as PresetColor)) return true
  return isValidHexColor(color)
}

// ============================================================================
// Type Guards for Unknown Data
// ============================================================================

/**
 * Checks if a value is a valid node object (unknown input).
 */
export function isNodeObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null
}

/**
 * Checks if a value is a valid edge object (unknown input).
 */
export function isEdgeObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null
}

/**
 * Checks if a value is a valid canvas content object (unknown input).
 * Arrays are objects to `typeof` but never a canvas.
 */
export function isCanvasObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
}

// ============================================================================
// Node Validation
// ============================================================================

/**
 * Validates the base properties common to all nodes.
 */
export function validateBaseNode(node: Record<string, unknown>, path: string): ValidationError[] {
  const errors: ValidationError[] = []

  // Required: id (string)
  if (typeof node.id !== 'string') {
    errors.push(createError(`${path}.id`, 'Node id must be a string', 'INVALID_TYPE'))
  } else if (node.id.trim() === '') {
    errors.push(createError(`${path}.id`, 'Node id cannot be empty', 'INVALID_VALUE'))
  }

  // Required: type (string)
  if (typeof node.type !== 'string') {
    errors.push(createError(`${path}.type`, 'Node type must be a string', 'INVALID_TYPE'))
  } else if (!VALID_NODE_TYPES.includes(node.type as NodeType)) {
    errors.push(
      createError(
        `${path}.type`,
        `Invalid node type "${node.type}". Must be one of: ${VALID_NODE_TYPES.join(', ')}`,
        'INVALID_VALUE',
      ),
    )
  }

  // Required: x (finite number)
  if (typeof node.x !== 'number') {
    errors.push(createError(`${path}.x`, 'Node x must be a number', 'INVALID_TYPE'))
  } else if (!Number.isFinite(node.x)) {
    errors.push(createError(`${path}.x`, 'Node x must be finite', 'INVALID_VALUE'))
  }

  // Required: y (finite number)
  if (typeof node.y !== 'number') {
    errors.push(createError(`${path}.y`, 'Node y must be a number', 'INVALID_TYPE'))
  } else if (!Number.isFinite(node.y)) {
    errors.push(createError(`${path}.y`, 'Node y must be finite', 'INVALID_VALUE'))
  }

  // Required: width (positive finite number)
  if (typeof node.width !== 'number') {
    errors.push(createError(`${path}.width`, 'Node width must be a number', 'INVALID_TYPE'))
  } else if (!Number.isFinite(node.width)) {
    errors.push(createError(`${path}.width`, 'Node width must be finite', 'INVALID_VALUE'))
  } else if (node.width <= 0) {
    errors.push(createError(`${path}.width`, 'Node width must be positive', 'INVALID_VALUE'))
  }

  // Required: height (positive finite number)
  if (typeof node.height !== 'number') {
    errors.push(createError(`${path}.height`, 'Node height must be a number', 'INVALID_TYPE'))
  } else if (!Number.isFinite(node.height)) {
    errors.push(createError(`${path}.height`, 'Node height must be finite', 'INVALID_VALUE'))
  } else if (node.height <= 0) {
    errors.push(createError(`${path}.height`, 'Node height must be positive', 'INVALID_VALUE'))
  }

  // Optional: color (string - preset or hex)
  if (node.color !== undefined) {
    if (typeof node.color !== 'string') {
      errors.push(createError(`${path}.color`, 'Node color must be a string', 'INVALID_TYPE'))
    } else if (!isValidColor(node.color)) {
      errors.push(
        createError(
          `${path}.color`,
          `Invalid color "${node.color}". Must be a preset (1-6) or hex color (#RGB or #RRGGBB)`,
          'INVALID_FORMAT',
        ),
      )
    }
  }

  return errors
}

/**
 * Validates text node specific properties.
 */
export function validateTextNode(node: Record<string, unknown>, path: string): ValidationError[] {
  const errors: ValidationError[] = []

  // Required: text (string)
  if (typeof node.text !== 'string') {
    errors.push(
      createError(
        `${path}.text`,
        'Text node must have a text property (string)',
        'MISSING_REQUIRED',
      ),
    )
  }

  return errors
}

/**
 * Validates file node specific properties.
 */
export function validateFileNode(node: Record<string, unknown>, path: string): ValidationError[] {
  const errors: ValidationError[] = []

  // Required: file (string)
  if (typeof node.file !== 'string') {
    errors.push(
      createError(
        `${path}.file`,
        'File node must have a file property (string)',
        'MISSING_REQUIRED',
      ),
    )
  }

  // Optional: subpath (string, must start with #)
  if (node.subpath !== undefined) {
    if (typeof node.subpath !== 'string') {
      errors.push(
        createError(`${path}.subpath`, 'File node subpath must be a string', 'INVALID_TYPE'),
      )
    } else if (!node.subpath.startsWith('#')) {
      errors.push(
        createError(`${path}.subpath`, 'File node subpath must start with #', 'INVALID_FORMAT'),
      )
    }
  }

  return errors
}

/**
 * Validates link node specific properties.
 */
export function validateLinkNode(node: Record<string, unknown>, path: string): ValidationError[] {
  const errors: ValidationError[] = []

  // Required: url (string)
  if (typeof node.url !== 'string') {
    errors.push(
      createError(`${path}.url`, 'Link node must have a url property (string)', 'MISSING_REQUIRED'),
    )
  }

  return errors
}

/**
 * Validates group node specific properties.
 */
export function validateGroupNode(node: Record<string, unknown>, path: string): ValidationError[] {
  const errors: ValidationError[] = []

  // Optional: label (string)
  if (node.label !== undefined && typeof node.label !== 'string') {
    errors.push(createError(`${path}.label`, 'Group node label must be a string', 'INVALID_TYPE'))
  }

  // Optional: background (string)
  if (node.background !== undefined && typeof node.background !== 'string') {
    errors.push(
      createError(`${path}.background`, 'Group node background must be a string', 'INVALID_TYPE'),
    )
  }

  // Optional: backgroundStyle (enum)
  if (node.backgroundStyle !== undefined) {
    if (typeof node.backgroundStyle !== 'string') {
      errors.push(
        createError(
          `${path}.backgroundStyle`,
          'Group node backgroundStyle must be a string',
          'INVALID_TYPE',
        ),
      )
    } else if (!VALID_BACKGROUND_STYLES.includes(node.backgroundStyle as BackgroundStyle)) {
      errors.push(
        createError(
          `${path}.backgroundStyle`,
          `Invalid backgroundStyle "${node.backgroundStyle}". Must be one of: ${VALID_BACKGROUND_STYLES.join(', ')}`,
          'INVALID_VALUE',
        ),
      )
    }
  }

  return errors
}

/**
 * Validates a single node.
 */
export function validateNode(node: unknown, path: string): ValidationError[] {
  if (!isNodeObject(node)) {
    return [createError(path, 'Node must be an object', 'INVALID_TYPE')]
  }

  const errors: ValidationError[] = []

  // Validate base properties
  errors.push(...validateBaseNode(node, path))

  // Validate type-specific properties
  if (typeof node.type === 'string') {
    switch (node.type) {
      case 'text':
        errors.push(...validateTextNode(node, path))
        break
      case 'file':
        errors.push(...validateFileNode(node, path))
        break
      case 'link':
        errors.push(...validateLinkNode(node, path))
        break
      case 'group':
        errors.push(...validateGroupNode(node, path))
        break
    }
  }

  return errors
}

// ============================================================================
// Edge Validation
// ============================================================================

/**
 * Validates a single edge.
 */
export function validateEdge(edge: unknown, path: string, nodeIds: Set<string>): ValidationError[] {
  if (!isEdgeObject(edge)) {
    return [createError(path, 'Edge must be an object', 'INVALID_TYPE')]
  }

  const errors: ValidationError[] = []

  // Required: id (string)
  if (typeof edge.id !== 'string') {
    errors.push(createError(`${path}.id`, 'Edge id must be a string', 'INVALID_TYPE'))
  } else if (edge.id.trim() === '') {
    errors.push(createError(`${path}.id`, 'Edge id cannot be empty', 'INVALID_VALUE'))
  }

  // Required: fromNode (string, must reference existing node)
  if (typeof edge.fromNode !== 'string') {
    errors.push(createError(`${path}.fromNode`, 'Edge fromNode must be a string', 'INVALID_TYPE'))
  } else if (!nodeIds.has(edge.fromNode)) {
    errors.push(
      createError(
        `${path}.fromNode`,
        `Edge references non-existent node "${edge.fromNode}"`,
        'INVALID_REFERENCE',
      ),
    )
  }

  // Required: toNode (string, must reference existing node)
  if (typeof edge.toNode !== 'string') {
    errors.push(createError(`${path}.toNode`, 'Edge toNode must be a string', 'INVALID_TYPE'))
  } else if (!nodeIds.has(edge.toNode)) {
    errors.push(
      createError(
        `${path}.toNode`,
        `Edge references non-existent node "${edge.toNode}"`,
        'INVALID_REFERENCE',
      ),
    )
  }

  // Optional: fromSide (enum)
  if (edge.fromSide !== undefined) {
    if (typeof edge.fromSide !== 'string') {
      errors.push(createError(`${path}.fromSide`, 'Edge fromSide must be a string', 'INVALID_TYPE'))
    } else if (!VALID_DIRECTIONS.includes(edge.fromSide as Direction)) {
      errors.push(
        createError(
          `${path}.fromSide`,
          `Invalid fromSide "${edge.fromSide}". Must be one of: ${VALID_DIRECTIONS.join(', ')}`,
          'INVALID_VALUE',
        ),
      )
    }
  }

  // Optional: toSide (enum)
  if (edge.toSide !== undefined) {
    if (typeof edge.toSide !== 'string') {
      errors.push(createError(`${path}.toSide`, 'Edge toSide must be a string', 'INVALID_TYPE'))
    } else if (!VALID_DIRECTIONS.includes(edge.toSide as Direction)) {
      errors.push(
        createError(
          `${path}.toSide`,
          `Invalid toSide "${edge.toSide}". Must be one of: ${VALID_DIRECTIONS.join(', ')}`,
          'INVALID_VALUE',
        ),
      )
    }
  }

  // Optional: fromEnd (enum)
  if (edge.fromEnd !== undefined) {
    if (typeof edge.fromEnd !== 'string') {
      errors.push(createError(`${path}.fromEnd`, 'Edge fromEnd must be a string', 'INVALID_TYPE'))
    } else if (!VALID_MARKER_TYPES.includes(edge.fromEnd as MarkerType)) {
      errors.push(
        createError(
          `${path}.fromEnd`,
          `Invalid fromEnd "${edge.fromEnd}". Must be one of: ${VALID_MARKER_TYPES.join(', ')}`,
          'INVALID_VALUE',
        ),
      )
    }
  }

  // Optional: toEnd (enum)
  if (edge.toEnd !== undefined) {
    if (typeof edge.toEnd !== 'string') {
      errors.push(createError(`${path}.toEnd`, 'Edge toEnd must be a string', 'INVALID_TYPE'))
    } else if (!VALID_MARKER_TYPES.includes(edge.toEnd as MarkerType)) {
      errors.push(
        createError(
          `${path}.toEnd`,
          `Invalid toEnd "${edge.toEnd}". Must be one of: ${VALID_MARKER_TYPES.join(', ')}`,
          'INVALID_VALUE',
        ),
      )
    }
  }

  // Optional: label (string)
  if (edge.label !== undefined && typeof edge.label !== 'string') {
    errors.push(createError(`${path}.label`, 'Edge label must be a string', 'INVALID_TYPE'))
  }

  // Optional: color (string - preset or hex)
  if (edge.color !== undefined) {
    if (typeof edge.color !== 'string') {
      errors.push(createError(`${path}.color`, 'Edge color must be a string', 'INVALID_TYPE'))
    } else if (!isValidColor(edge.color)) {
      errors.push(
        createError(
          `${path}.color`,
          `Invalid color "${edge.color}". Must be a preset (1-6) or hex color (#RGB or #RRGGBB)`,
          'INVALID_FORMAT',
        ),
      )
    }
  }

  return errors
}

// ============================================================================
// Canvas Validation
// ============================================================================

/**
 * Validates unknown input (e.g. external JSON) as canvas content.
 *
 * `nodes` and `edges` are optional, as in the JSON Canvas spec, so a valid
 * result does not make the input an ICanvasContent: pass it through
 * normalizeCanvas before handing it to anything that reads those arrays.
 */
export function validateCanvasData(data: unknown): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []

  if (!isCanvasObject(data)) {
    errors.push(createError('', 'Canvas content must be an object', 'INVALID_TYPE'))
    return { valid: false, errors, warnings }
  }

  // Validate nodes array, collecting node IDs for edge reference checks
  // (an empty set when nodes is absent, so edges are still checked below)
  const nodeIds = new Set<string>()
  if (data.nodes !== undefined) {
    if (!Array.isArray(data.nodes)) {
      errors.push(createError('nodes', 'Canvas nodes must be an array', 'INVALID_TYPE'))
    } else {
      // Collect node IDs and check for duplicates
      data.nodes.forEach((node, index) => {
        const nodePath = `nodes[${index}]`
        errors.push(...validateNode(node, nodePath))

        if (isNodeObject(node) && typeof node.id === 'string') {
          if (nodeIds.has(node.id)) {
            errors.push(
              createError(`${nodePath}.id`, `Duplicate node ID "${node.id}"`, 'DUPLICATE_ID'),
            )
          }
          nodeIds.add(node.id)
        }
      })
    }
  }

  // Validate edges (independent of whether nodes was provided/an array)
  if (data.edges !== undefined) {
    if (!Array.isArray(data.edges)) {
      errors.push(createError('edges', 'Canvas edges must be an array', 'INVALID_TYPE'))
    } else {
      const edgeIds = new Set<string>()
      data.edges.forEach((edge, index) => {
        const edgePath = `edges[${index}]`
        errors.push(...validateEdge(edge, edgePath, nodeIds))

        if (isEdgeObject(edge) && typeof edge.id === 'string') {
          if (edgeIds.has(edge.id)) {
            errors.push(
              createError(`${edgePath}.id`, `Duplicate edge ID "${edge.id}"`, 'DUPLICATE_ID'),
            )
          }
          edgeIds.add(edge.id)
        }
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Formats the errors of a result as one line each: the path in brackets, when
 * there is one, then the message.
 */
export function formatValidationErrors(result: ValidationResult): string[] {
  return result.errors.map((error) => {
    const location = error.path ? `[${error.path}] ` : ''
    return `${location}${error.message}`
  })
}

/**
 * Fills in `nodes`/`edges` when absent. validateCanvasData accepts a canvas
 * without them, as the JSON Canvas spec allows, but ICanvasContent and every
 * operation require both arrays: pass validated data through this before use.
 * A canvas that has both is returned as is, so a caller can still compare it
 * by identity.
 */
export function normalizeCanvas(data: Partial<ICanvasContent>): ICanvasContent {
  if (Array.isArray(data.nodes) && Array.isArray(data.edges)) return data as ICanvasContent
  return { ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] }
}

/**
 * Type guard: is unknown data valid canvas content? Stricter than
 * validateCanvasData: ICanvasContent requires both arrays, so this narrows only
 * when both are present. Use normalizeCanvas for spec-valid data that omits them.
 */
export function isValidCanvas(data: unknown): data is ICanvasContent {
  if (!isCanvasObject(data) || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    return false
  }
  return validateCanvasData(data).valid
}
