/** `@osdlc/system-model/rust`: the rust ecosystem, cargo, and cargo's aliases. */

import { evidence } from '../../model.ts'
import type { ToolDef } from '../../tool.ts'
import { flagAtEnd, joinRel } from '../support/shared.ts'
import { cargoAliasesRunner, configFiles } from './cargo-aliases.ts'
import { cargoRunner, CARGO_BRAND } from './cargo.ts'
import { rustEcosystem } from './ecosystem.ts'

/** cargo: fetches a crate's dependencies and runs its conventional verbs. */
export const cargo: ToolDef = {
  id: 'cargo',
  homepage: 'https://doc.rust-lang.org/cargo/',
  description: "Rust's package manager and build tool.",
  brand: CARGO_BRAND,
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

/** cargo aliases: the `[alias]` table of each `.cargo/config.toml`, xtask included. */
export const cargoAliases: ToolDef = {
  id: 'cargo-aliases',
  homepage: 'https://doc.rust-lang.org/cargo/reference/config.html#alias',
  description: 'The command aliases a .cargo/config.toml declares for cargo.',
  brand: CARGO_BRAND,
  binary: 'cargo',
  ecosystem: rustEcosystem,
  detect: async (ctx) =>
    (await configFiles(ctx)).map((file) => evidence('files', file, '.cargo/config.toml')),
  roles: { runner: cargoAliasesRunner },
}

/** Every tool this plugin defines. */
export const rustTools: readonly ToolDef[] = [cargo, cargoAliases]

export { rustEcosystem }
