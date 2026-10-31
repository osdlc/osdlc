/**
 * `devlinkHook`: devlink as a {@link DevlinkHook} for `runMain`, so a tool
 * gets `<name> dev …` and the hand-off to a linked checkout from one option.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { DevlinkHook, DevlinkWhere } from '../run-main.ts'
import { installDir, realPath } from '../where.ts'
import { runDevCli } from './cli.ts'
import { execSelection } from './exec.ts'
import { cwdCheckout, resolve, type Selection } from './resolve.ts'
import { homeVar, launchLayerVar, quietVar, type ToolSpec } from './spec.ts'
import { homePath } from './state.ts'

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
 * the tool) resolves for itself. It keeps the value for its `describe`, which
 * `runMain` asks when it answers `--where`.
 * @experimental
 */
export function devlinkHook(spec: ToolSpec, opts: DevlinkHookOptions = {}): DevlinkHook {
  let described: DevlinkWhere | null = null
  const hook: DevlinkHook = (argv, ctx) => {
    described = null
    const script = opts.script ?? process.argv[1]
    const self = script === undefined ? null : ownCheckout(spec, script)
    const selfInstall = script === undefined ? null : ownInstall(script)
    if (argv[0] === 'dev') {
      return runDevCli(spec, argv.slice(1), {
        io: ctx.io,
        env: ctx.env,
        cwd: ctx.cwd,
        self,
        selfInstall,
      })
    }
    const layerVar = launchLayerVar(spec)
    const layer = ctx.env[layerVar]
    delete ctx.env[layerVar]
    if (ctx.env !== process.env) delete process.env[layerVar]
    if (layer !== undefined) {
      described = {
        ...handedOff(spec, self ?? selfInstall, layer),
        ...(script === undefined ? {} : { script }),
      }
      return null
    }
    const selection = resolve(spec, { env: ctx.env, cwd: ctx.cwd, self, selfInstall })
    if (selection.source === 'local') {
      if (selection.hint !== undefined && ctx.env[quietVar(spec)] !== '1') {
        ctx.io.stderr(`${spec.name}: ${selection.hint}\n`)
      }
      described = { ...notHandedOff(self, selection), ...(script === undefined ? {} : { script }) }
    }
    return execSelection(spec, selection, argv, {
      env: ctx.env,
      announce: (line) => ctx.io.stderr(`${line}\n`),
      version: packageVersion(self ?? selfInstall),
    })
  }
  hook.describe = () => described
  return hook
}

/** `--where` in a process a launcher started, told the layer that chose it. */
function handedOff(spec: ToolSpec, checkout: string | null, layer: string): DevlinkWhere {
  switch (layer) {
    case 'env':
      return { checkout, layer, text: `env ($${homeVar(spec)})` }
    case 'cwd':
      return { checkout, layer, text: 'cwd (a checkout above the working directory)' }
    case 'link': {
      const linkFile = homePath(spec)
      return { checkout, layer, text: `link (${linkFile})`, linkFile }
    }
    case 'project':
      return {
        checkout,
        layer,
        text: `project install (${checkout ?? "the project's node_modules"})`,
      }
    case 'local':
      return {
        checkout,
        layer,
        text: "local (the launcher's own checkout; no devlink layer selected another)",
      }
    default:
      return { checkout, layer, text: `${layer} (as $${launchLayerVar(spec)} says)` }
  }
}

/** `--where` in a process that resolved to itself and ran its own code. */
function notHandedOff(checkout: string | null, selection: Selection): DevlinkWhere {
  const what = checkout === null ? 'this install' : 'this checkout'
  // `local` when no layer matched; otherwise `<why>: this checkout`, from a
  // layer that named the checkout this script runs from.
  const why =
    selection.reason === 'local'
      ? 'no devlink layer selected another'
      : `${selection.reason.replace(/: this checkout$/, '')}, which is this one`
  return { checkout, layer: 'self', text: `${what} (${why})` }
}

/** The installed package directory `script` runs from, or null outside `node_modules`. */
function ownInstall(script: string): string | null {
  const real = realPath(script)
  return real === null ? null : installDir(real)
}

/** The `version` in `dir/package.json`, or null. */
function packageVersion(dir: string | null): string | null {
  if (dir === null) return null
  try {
    const v = (
      JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { version?: unknown }
    ).version
    return typeof v === 'string' ? v : null
  } catch {
    return null
  }
}

/**
 * The checkout `script` belongs to, found by walking up from its directory,
 * or null for an installed package. A path through `node_modules` is an
 * install, so the walk never reaches a checkout around it.
 */
function ownCheckout(spec: ToolSpec, script: string): string | null {
  const real = realPath(script)
  if (real === null || installDir(real) !== null) return null
  return cwdCheckout(spec, dirname(real))
}
