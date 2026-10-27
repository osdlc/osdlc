/**
 * `devlinkHook`: devlink as a {@link DevlinkHook} for `runMain`, so a tool
 * gets `<name> dev …` and the hand-off to a linked checkout from one option.
 */

import { realpathSync } from 'node:fs'
import { dirname, sep } from 'node:path'

import type { DevlinkHook } from '../run-main.ts'
import { runDevCli } from './cli.ts'
import { execSelection } from './exec.ts'
import { cwdCheckout, resolve } from './resolve.ts'
import { launchLayerVar, type ToolSpec } from './spec.ts'

/**
 * Options for {@link devlinkHook}.
 * @experimental
 */
export interface DevlinkHookOptions {
  /** The script that is running, for finding its own checkout. Defaults to `process.argv[1]`. */
  script?: string
}

/**
 * The hook `runMain` runs first. `<name> dev …` is answered by
 * {@link runDevCli}. Otherwise the selected checkout runs through
 * {@link execSelection}, unless this process was itself started that way
 * (`<NAME>_LAUNCH_LAYER` is set), so a hand-off never hands off again. The
 * hook deletes that variable from `ctx.env` and from `process.env` once it has
 * read it, so a process this run starts (a git hook, a shell, a nested run of
 * the tool) resolves for itself.
 * @experimental
 */
export function devlinkHook(spec: ToolSpec, opts: DevlinkHookOptions = {}): DevlinkHook {
  return (argv, ctx) => {
    const script = opts.script ?? process.argv[1]
    const self = script === undefined ? null : ownCheckout(spec, script)
    if (argv[0] === 'dev') {
      return runDevCli(spec, argv.slice(1), { io: ctx.io, env: ctx.env, self })
    }
    const layer = launchLayerVar(spec)
    const handedOff = ctx.env[layer] !== undefined
    delete ctx.env[layer]
    if (ctx.env !== process.env) delete process.env[layer]
    if (handedOff) return null
    return execSelection(spec, resolve(spec, { env: ctx.env, cwd: ctx.cwd, self }), argv, {
      env: ctx.env,
      announce: (line) => ctx.io.stderr(`${line}\n`),
    })
  }
}

/**
 * The checkout `script` belongs to, found by walking up from its directory,
 * or null for an installed package. A path through `node_modules` is an
 * install, so the walk never reaches a checkout around it.
 */
function ownCheckout(spec: ToolSpec, script: string): string | null {
  let real: string
  try {
    real = realpathSync(script)
  } catch {
    return null
  }
  if (real.split(sep).includes('node_modules')) return null
  return cwdCheckout(spec, dirname(real))
}
