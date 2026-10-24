/** The swift ecosystem: `Package.swift`. */

import type { EcosystemDef } from '../../tool.ts'

export const PACKAGE_SWIFT = 'Package.swift'

/** The swift ecosystem. */
export const swiftEcosystem: EcosystemDef = {
  id: 'swift',
  manifests: [{ files: PACKAGE_SWIFT, tool: 'swiftpm' }],
  languages: [{ id: 'swift' }],
  tools: ['swiftpm'],
}
