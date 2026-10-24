/** `@osdlc/project/swift`: the swift ecosystem and SwiftPM. */

import type { ToolDef } from '../../tool.ts'
import { swiftEcosystem } from './ecosystem.ts'
import { swiftpmRunner } from './swiftpm.ts'

/** SwiftPM: the conventional verbs of a `Package.swift`. */
export const swiftpm: ToolDef = {
  id: 'swiftpm',
  binary: 'swift',
  ecosystem: swiftEcosystem,
  roles: { runner: swiftpmRunner },
}

/** Every tool this plugin defines. */
export const swiftTools: readonly ToolDef[] = [swiftpm]

export { swiftEcosystem }
