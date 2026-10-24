#!/usr/bin/env node
// The installed `way`. Before running its own code it asks devlink which
// checkout should answer: `WAY_HOME`, a wayfinder checkout above the cwd, or one
// linked by `way dev link`. Any of those other than this one runs there
// instead, so an installed `way` follows the source you are working on.
// Requires the built dist/ (`pnpm run build`).
import { execSelection, resolve } from '@osdlc/cli-tool/devlink'

import { main } from '../dist/cli.js'
import { WAYFINDER_SPEC, checkoutRoot } from '../dist/devlink.js'

const argv = process.argv.slice(2)
const handedOff = execSelection(
  WAYFINDER_SPEC,
  resolve(WAYFINDER_SPEC, { self: checkoutRoot() }),
  argv,
)
process.exitCode = handedOff ?? (await main(argv))
