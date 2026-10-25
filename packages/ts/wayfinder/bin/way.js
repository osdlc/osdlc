#!/usr/bin/env node
// The installed `way`. Before running its own code it asks devlink which
// checkout should answer: the one `WAY_HOME` names, or the one `way dev link`
// linked. A checkout other than this one runs there instead. The cwd is never
// searched, so a repository you stand in cannot choose the code that runs.
// Requires the built dist/ (`pnpm run build`).
import { execSelection, resolve } from '@osdlc/cli-tool/devlink'

import { main } from '../dist/cli.js'
import { WAYFINDER_SPEC, checkoutRoot } from '../dist/devlink.js'
import { guardedExit, terminalSafe } from '../dist/terminal-text.js'

const argv = process.argv.slice(2)
// An error nothing caught is printed terminal-safe, not raw by Node.
process.exitCode = await guardedExit(() => {
  const handedOff = execSelection(
    WAYFINDER_SPEC,
    resolve(WAYFINDER_SPEC, { self: checkoutRoot() }),
    argv,
    { announce: (line) => process.stderr.write(`${terminalSafe(line)}\n`) },
  )
  return handedOff ?? main(argv)
})
