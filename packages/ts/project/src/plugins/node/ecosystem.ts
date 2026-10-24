/** The node ecosystem: `package.json`, TypeScript or JavaScript, and its managers in precedence order. */

import type { EcosystemDef } from '../../tool.ts'
import { parsePackageJson } from './package-json.ts'

export const PACKAGE_JSON = 'package.json'

/** The node ecosystem. Lockfile precedence is bun, pnpm, yarn, npm; npm is assumed with no lockfile. */
export const nodeEcosystem: EcosystemDef = {
  id: 'node',
  manifests: [
    { files: PACKAGE_JSON, tool: 'node-scripts', slot: 'packageJson', parse: parsePackageJson },
  ],
  languages: [
    { id: 'typescript', files: ['tsconfig.json'], dependencies: ['typescript'] },
    { id: 'javascript' },
  ],
  tools: ['bun', 'pnpm', 'yarn', 'npm', 'node-scripts'],
  fallback: 'npm',
}
