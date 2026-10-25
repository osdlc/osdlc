/** `@osdlc/system-model/swift`: the swift ecosystem and SwiftPM. */

import type { ToolDef } from '../../tool.ts'
import { swiftEcosystem } from './ecosystem.ts'
import { swiftpmRunner, SWIFTPM_BRAND } from './swiftpm.ts'

/** SwiftPM: the conventional verbs of a `Package.swift`. */
export const swiftpm: ToolDef = {
  id: 'swiftpm',
  homepage: 'https://www.swift.org/documentation/package-manager/',
  description: "Swift's package manager and build tool.",
  brand: SWIFTPM_BRAND,
  binary: 'swift',
  ecosystem: swiftEcosystem,
  roles: { runner: swiftpmRunner },
}

/** Every tool this plugin defines. */
export const swiftTools: readonly ToolDef[] = [swiftpm]

export { swiftEcosystem }
