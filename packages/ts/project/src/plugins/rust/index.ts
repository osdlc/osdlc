/** `@osdlc/project/rust`: the rust ecosystem and cargo. */

import type { ToolDef } from '../../tool.ts'
import { flagAtEnd, joinRel } from '../support/shared.ts'
import { cargoRunner } from './cargo.ts'
import { rustEcosystem } from './ecosystem.ts'

/** cargo: fetches a crate's dependencies and runs its conventional verbs. */
export const cargo: ToolDef = {
  id: 'cargo',
  binary: 'cargo',
  ecosystem: rustEcosystem,
  roles: {
    packageManager: {
      lockfiles: ['Cargo.lock'],
      install: ['cargo', 'fetch'],
      frozen: ['--locked'],
      inDir: flagAtEnd('--manifest-path', (dir) => joinRel(dir, 'Cargo.toml')),
    },
    runner: cargoRunner,
  },
}

/** Every tool this plugin defines. */
export const rustTools: readonly ToolDef[] = [cargo]

export { rustEcosystem }
