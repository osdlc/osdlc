/**
 * The plugins the command line knows, and the choice among them. Every
 * plugin, built in, loaded from a package or a descriptor, has one name in
 * one namespace.
 */

import { cargoDefinition } from './cargo.ts'
import { descriptorPlugin, type DescriptorOptions } from './descriptor/engine.ts'
import {
  DescriptorLoadError,
  loadDescriptors,
  type DescriptorSources,
  type LoadedDescriptor,
} from './descriptor/load.ts'
import { gitDefinition } from './git.ts'
import { byName, type LoadedPackage, type PackageEntry } from './load.ts'
import { nodeDefinition } from './node.ts'
import { orcaDefinition } from './orca.ts'
import { detection } from './run.ts'
import type { Ctx, Detection, Plugin, PluginDefinition } from './types.ts'

/**
 * The shipped plugins, in run order. Order decides which plugin keeps a
 * duplicate id, and the order `prepare` and `deleted` run in.
 */
export const BUILT_IN_PLUGINS: readonly PluginDefinition[] = [
  gitDefinition,
  cargoDefinition,
  nodeDefinition,
  orcaDefinition,
]

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
 * @throws DescriptorLoadError for a descriptor named as a package in the config, one whose `supersededBy` names a descriptor, or any clash {@link loadDescriptors} refuses
 * @throws DescriptorError for a descriptor file that can't be used
 */
export function loadPlugins(
  sources: DescriptorSources,
  opts: DescriptorOptions = {},
  packages: Packages = { loaded: [], entries: [] },
): Loaded {
  const descriptors = loadDescriptors(
    sources,
    BUILT_IN_PLUGINS.map((d) => d.name),
  )
  for (const d of descriptors) {
    const entry = packages.entries.find((e) => e.name === d.name)
    if (entry !== undefined) {
      throw new DescriptorLoadError(
        `descriptor ${d.path} is named ${d.name}, as the package plugins.${d.name}.package names (${entry.package}); every plugin has its own name, so rename the file`,
      )
    }
    const over = d.descriptor.supersededBy
    if (over !== undefined && descriptors.some((x) => x.name === over)) {
      throw new DescriptorLoadError(
        `descriptor ${d.path} has supersededBy: ${over}, which is a descriptor; it must name a built-in or package plugin`,
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

/** A descriptor's `supersededBy` test, and the plugins it answers for. */
export interface Supersession {
  /** `plugins`, each wrapped so its `detect` answer is kept; `runs` knows these and no others. */
  watch(plugins: readonly Plugin[]): Plugin[]
  /**
   * A descriptor's `runs`: whether the plugin `name` is watched and detects, its
   * `detect` answering `true` or `{ active: true }`. Survey asks the code plugins
   * before the descriptors, so this is survey's own answer, under the plugin's
   * own time limit, and `detect` runs once. One whose `detect` threw, or is still
   * pending because survey gave up on it, counts as not running, so the
   * descriptor applies. One not asked yet is asked here.
   */
  runs(name: string, ctx: Ctx): Promise<boolean>
}

export function supersession(): Supersession {
  let watched = new Map<string, Plugin>()
  const answers = new Map<string, 'pending' | boolean>()
  const detect = async (p: Plugin, ctx: Ctx): Promise<boolean | Detection> => {
    answers.set(p.name, 'pending')
    try {
      const answer = await p.detect(ctx)
      answers.set(p.name, detection(answer)?.active === true)
      return answer
    } catch (err) {
      answers.set(p.name, false)
      throw err
    }
  }
  return {
    watch(plugins) {
      watched = new Map(plugins.map((p) => [p.name, p]))
      answers.clear()
      return plugins.map((p) =>
        Object.assign(Object.create(p) as Plugin, {
          name: p.name,
          detect: (ctx: Ctx) => detect(p, ctx),
        }),
      )
    },
    async runs(name, ctx) {
      const p = watched.get(name)
      if (p === undefined) return false
      const known = answers.get(name)
      if (known !== undefined) return known === true
      await detect(p, ctx).catch(() => undefined)
      return answers.get(name) === true
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
