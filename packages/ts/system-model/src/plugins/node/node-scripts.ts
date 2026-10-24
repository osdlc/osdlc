/**
 * package.json `scripts`, run through the package's own manager.
 *
 * The run verb comes from the package manager chosen for the package (its
 * `packageManager` field, then the nearest lockfile at or above it, else
 * npm), so a nested package in a workspace runs through the workspace's
 * manager.
 */

import type { RunnerContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { Package, RunnerRole } from '../../tool.ts'
import { looksPersistent, taskId, tierOf } from '../support/shared.ts'
import { PACKAGE_JSON } from './ecosystem.ts'
import { NODE_MANAGERS, npm } from './managers.ts'

const CHAIN = [
  {
    label: 'runner',
    hint: 'The package manager runs the `scripts` entries declared in a package.json.',
  },
  {
    label: 'directory',
    hint: 'The directory the package sits in. A grouping this catalog adds, not part of the command.',
  },
  { label: 'package', hint: "The package's declared name, or its path when it has none." },
  { label: 'script', hint: 'The key under `scripts` in that package.json.' },
]

/**
 * The Node.js hexagonal mark. Node.js is a trademark of the OpenJS
 * Foundation; it is used here nominatively, to identify the tool. Icon
 * path and color: simple-icons v16 (CC0), slug `nodedotjs`.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383 c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.037,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076 c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.271,0 L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.189,0.139,0.235l2.409,1.392 c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021 c0,1.745-0.95,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921 c0-0.659,0.353-1.275,0.922-1.603l8.795-5.082c0.557-0.315,1.296-0.315,1.848,0l8.794,5.082c0.57,0.329,0.924,0.944,0.924,1.603 v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.794,5.078C12.643,23.916,12.324,24,11.998,24z M19.099,13.993 c0-1.9-1.284-2.406-3.987-2.763c-2.731-0.361-3.009-0.548-3.009-1.187c0-0.528,0.235-1.233,2.258-1.233 c1.807,0,2.473,0.389,2.747,1.607c0.024,0.115,0.129,0.199,0.247,0.199h1.141c0.071,0,0.138-0.031,0.186-0.081 c0.048-0.054,0.074-0.123,0.067-0.196c-0.177-2.098-1.571-3.076-4.388-3.076c-2.508,0-4.004,1.058-4.004,2.833 c0,1.925,1.488,2.457,3.895,2.695c2.88,0.282,3.103,0.703,3.103,1.269c0,0.983-0.789,1.402-2.642,1.402 c-2.327,0-2.839-0.584-3.011-1.742c-0.02-0.124-0.126-0.215-0.253-0.215h-1.137c-0.141,0-0.254,0.112-0.254,0.253 c0,1.482,0.806,3.248,4.655,3.248C17.501,17.007,19.099,15.91,19.099,13.993z"/></svg>',
  color: '#5fa04e',
}

export const nodeScriptsRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,
  brand: BRAND,

  async collect(ctx: RunnerContext, packages: readonly Package[]): Promise<ProviderResult> {
    const diagnostics: Diagnostic[] = []
    const tasks: Task[] = []

    for (const pkg of packages) {
      const file = pkg.manifestFiles.find(
        (f) => f === PACKAGE_JSON || f.endsWith(`/${PACKAGE_JSON}`),
      )
      if (file === undefined) continue
      const fact = pkg.manifests.packageJson
      if (fact === undefined) {
        // Test suites keep deliberately malformed manifests; a real one failing
        // to parse is worth surfacing, a fixture doing so is noise.
        if (!/(^|\/)(fixtures|__fixtures__)\//.test(file)) {
          diagnostics.push({ severity: 'warning', message: 'unparseable manifest', source: file })
        }
        continue
      }

      const entries = Object.entries(fact.scripts)
      if (entries.length === 0) continue

      const dir = pkg.dir
      const manager = managerFor(ctx, dir)
      const label = fact.name !== undefined && fact.name !== '' ? fact.name : dir

      for (const [script, body] of entries) {
        // The manager's own directory flag addresses any manifest and keeps the
        // command correct when run from the root.
        const argv =
          dir === '.' ? [...manager.verb, script] : [...manager.verb, manager.dirFlag, dir, script]
        tasks.push({
          id: taskId('node-scripts', file, script),
          runner: 'node-scripts',
          path: ['node-scripts', dir === '.' ? '.' : tierOf(dir), label, script],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'declared',
          detail: body,
          tags: ['node-scripts', manager.id, dir],
          persistent: {
            // Bare `vite` is the dev server, but `vite build` exits. `--watch`
            // still wins, including on `vite build --watch`.
            value: looksPersistent(script) || /--watch|nuxt dev|vite\b(?!\s+build)/.test(body),
            declared: false,
          },
          executes: 'local',
        })
      }
    }

    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },

  invoke(task, args) {
    if (args.length === 0) return [...task.argv]
    const manager = NODE_MANAGERS.find((m) => m.binary === task.argv[0])
    const separator = manager?.roles.packageManager?.run?.separator === true
    return separator ? [...task.argv, '--', ...args] : [...task.argv, ...args]
  },
}

interface RunVerb {
  id: string
  verb: readonly string[]
  dirFlag: string
}

/** The run verb of the node manager chosen for `dir`, npm when none is. */
function managerFor(ctx: RunnerContext, dir: string): RunVerb {
  const choice = ctx.packageManagers(dir).find((c) => c.ecosystem === 'node')
  const tool = ctx.tools.find((t) => t.id === choice?.tool) ?? npm
  const run = tool.roles.packageManager?.run ?? npm.roles.packageManager!.run!
  return { id: tool.id, verb: run.verb, dirFlag: run.dirFlag }
}
