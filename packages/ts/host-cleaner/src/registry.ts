/**
 * The plugins the command line knows, and the choice among them. Every
 * plugin, built in, loaded from a package or a descriptor, has one name in
 * one namespace.
 */

import { BUILT_IN_PLUGINS } from './builtins.ts'
import { descriptorPlugin, type DescriptorOptions } from './descriptor/engine.ts'
import {
  DescriptorLoadError,
  loadDescriptors,
  type DescriptorSources,
  type LoadedDescriptor,
} from './descriptor/load.ts'
import { shareKit } from './kit.ts'
import { byName, type LoadedPackage, type PackageEntry } from './load.ts'
import { detection } from './run.ts'
import type { Ctx, Plugin, PluginDefinition } from './types.ts'

export { BUILT_IN_PLUGINS }

/** A run's plugin definitions, and where each package and descriptor among them came from. */
export interface Loaded {
  /** The built-ins in run order, then the packages, then one plugin per descriptor, each by name. */
  definitions: readonly PluginDefinition[]
  /** Each package loaded, by name. */
  packages: readonly LoadedPackage[]
  /** Each descriptor used, by name. */
  descriptors: readonly LoadedDescriptor[]
}

/** The packages the config names: those loaded, and every entry with a `package`, loaded or not. */
export interface Packages {
  loaded: readonly LoadedPackage[]
  entries: readonly PackageEntry[]
}

/**
 * The built-ins, then the `packages` loaded, then the descriptors from
 * `sources`, each by name; `opts` is passed to each descriptor's plugin.
 *
 * @throws DescriptorLoadError for a descriptor named as a package in the
 *   config, one whose `supersededBy` names neither a built-in plugin nor a
 *   package in the config, or any clash {@link loadDescriptors} refuses
 * @throws DescriptorError for a descriptor file that can't be used
 */
export function loadPlugins(
  sources: DescriptorSources,
  opts: DescriptorOptions = {},
  packages: Packages = { loaded: [], entries: [] },
): Loaded {
  const builtIns = BUILT_IN_PLUGINS.map((d) => d.name)
  const descriptors = loadDescriptors(sources, builtIns)
  const code = [...builtIns, ...packages.entries.map((e) => e.name)]
  for (const d of descriptors) {
    const entry = packages.entries.find((e) => e.name === d.name)
    if (entry !== undefined) {
      throw new DescriptorLoadError(
        `descriptor ${d.path} is named ${d.name}, as the package plugins.${d.name}.package names (${entry.package}); every plugin has its own name, so rename the file`,
      )
    }
    const by = d.descriptor.supersededBy
    if (by !== undefined && !code.includes(by)) {
      throw new DescriptorLoadError(
        `descriptor ${d.path}: supersededBy ${by} is no built-in plugin and no package the config names; have ${code.join(', ')}`,
      )
    }
  }
  const loaded = [...packages.loaded].sort(byName)
  return {
    definitions: [
      ...BUILT_IN_PLUGINS,
      ...loaded.map((p) => p.definition),
      ...descriptors.map((d) => descriptorPlugin(d.name, d.descriptor, opts)),
    ],
    packages: loaded,
    descriptors,
  }
}

/** A descriptor's `runs` for `supersededBy`, fed by the detect answers of the plugins that run. */
export interface Supersession {
  /**
   * Whether the plugin of `name` is among those given to `track` and its last
   * `detect` answered `true` or `{ active: true }`. Never calls `detect`: one
   * that has not answered yet, or threw, does not run.
   */
  runs: (name: string) => boolean
  /** `plugins`, each `detect` answer kept for `runs`. */
  track: (plugins: readonly Plugin[]) => Plugin[]
}

/**
 * A {@link Supersession}. Survey runs the code plugins' `detect` before any
 * descriptor's, so a descriptor reads the answer survey acted on.
 */
export function supersession(): Supersession {
  const answers = new Map<string, unknown>()
  return {
    runs: (name) => detection(answers.get(name))?.active === true,
    track: (plugins) => {
      answers.clear()
      return plugins.map((p) => {
        // A package's plugin may have its hooks on a prototype, which a spread would lose.
        const tracked = Object.assign(Object.create(p) as Plugin, {
          name: p.name,
          detect: async (ctx: Ctx) => {
            answers.delete(p.name)
            const answer = await p.detect(ctx)
            answers.set(p.name, answer)
            return answer
          },
        })
        shareKit(p, tracked)
        return tracked
      })
    },
  }
}

/** A `--plugin` or `--skip-plugin` that names no plugin. */
export class UnknownPlugin extends Error {
  override name = 'UnknownPlugin'
}

/**
 * `plugins` narrowed to `want` when given, less `skip`. A name no plugin has is an error.
 *
 * @throws UnknownPlugin
 */
export function selectPlugins(
  plugins: readonly Plugin[],
  want: readonly string[] | undefined,
  skip: readonly string[] | undefined,
): Plugin[] {
  const known = new Set(plugins.map((p) => p.name))
  for (const name of [...(want ?? []), ...(skip ?? [])]) {
    if (!known.has(name)) {
      throw new UnknownPlugin(`no plugin named ${name}; have ${[...known].join(', ')}`)
    }
  }
  return plugins.filter(
    (p) =>
      (want === undefined || want.length === 0 || want.includes(p.name)) && !skip?.includes(p.name),
  )
}
