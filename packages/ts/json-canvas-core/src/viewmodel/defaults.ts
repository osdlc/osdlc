import type { ViewModelConfig } from './types.ts'

/** Default CanvasViewModel config, overridable per-instance via constructor options. */
export const DEFAULT_CONFIG: Required<ViewModelConfig> = {
  // Resize/interaction boundaries
  resizeBoundary: 8,
  minNodeWidth: 100,
  minNodeHeight: 50,

  // Snapping
  snapThreshold: 8,
  snapEnabled: true,

  // Viewport constraints
  minScale: 0.1,
  maxScale: 3.0,
  zoomSpeed: 0.1,

  // Node creation defaults
  defaultNodeWidth: 200,
  defaultNodeHeight: 100,
}

/**
 * Merge partial config with defaults.
 * Returns a complete config with all required values.
 *
 * @param partial - Optional partial configuration to merge
 * @returns Complete configuration with defaults for unspecified values
 */
export function mergeConfig(partial?: ViewModelConfig): Required<ViewModelConfig> {
  return { ...DEFAULT_CONFIG, ...partial }
}
