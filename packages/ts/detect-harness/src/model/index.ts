/**
 * `@osdlc/detect-harness/model`: read one plugin folder into a typed model.
 *
 * @experimental The plugin model is the start of a harness-neutral surface for
 * import and translation. Its shape will change (a `HarnessSurface` with
 * provenance and agents is planned), and so may this entry's exports.
 *
 * Runtime-agnostic: `node:` APIs only.
 */

export * from './schema.ts'
export { readPlugin, type ReadPluginOptions } from './derive.ts'
export {
  readClaudeControlPlane,
  readPluginControlPlane,
  type ClaudeControlPlane,
  type ControlPlaneOptions,
} from './control-plane.ts'
export { REDACTED } from '../read/redact.ts'
