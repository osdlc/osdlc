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
import type { LoadedPackage, PackageEntry } from './load.ts'
import { nodeDefinition } from './node.ts'
import { orcaDefinition } from './orca.ts'
import type { Ctx, Plugin, PluginDefinition } from './types.ts'

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
  /** Each package loaded: its name, package, version and folder. */
  packages: readonly LoadedPackage[]
  /** Each descriptor used: its name, where it came from and what it replaced. */
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
 * @throws DescriptorLoadError for a descriptor named as a built-in plugin or as a package in the config, or as loadDescriptors
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
  }
  const loaded = [...packages.loaded].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )
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

/**
 * A descriptor's `runs`, for `supersededBy`: whether the plugin of that name is
 * among those `chosen` gives (enabled and not skipped) and detects.
 */
export const runsAmong =
  (chosen: () => readonly Plugin[]) =>
  async (name: string, ctx: Ctx): Promise<boolean> => {
    const p = chosen().find((x) => x.name === name)
    return p !== undefined && Boolean(await p.detect(ctx))
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
