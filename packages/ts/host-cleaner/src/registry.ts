/**
 * The plugins the command line knows, and the choice among them. Every
 * plugin, built in, loaded from a package or a descriptor, has one name in
 * one namespace.
 */

import { BUILT_IN_PLUGINS } from './builtins.ts'
import { descriptorPlugin, type DescriptorOptions } from './descriptor/engine.ts'
import {
  DescriptorLoadError,
  findDescriptors,
  type DescriptorProblem,
  type DescriptorSources,
  type LoadedDescriptor,
} from './descriptor/load.ts'
import { byName } from './helpers.ts'
import { PackageError, type LoadedPackage, type PackageEntry } from './load.ts'
import type { Plugin, PluginDefinition } from './types.ts'

export { BUILT_IN_PLUGINS }

/** A run's plugin definitions, and where each package and descriptor among them came from. */
export interface Loaded {
  /** The built-ins in run order, then the packages, then one plugin per descriptor, each by name. */
  definitions: readonly PluginDefinition[]
  /** Each package loaded, by name. */
  packages: readonly LoadedPackage[]
  /** Each descriptor used, by name. */
  descriptors: readonly LoadedDescriptor[]
  /** The names whose descriptor can't be used; they have no definition. */
  problems: readonly DescriptorProblem[]
}

/** The packages the config names: those loaded, and every entry with a `package`, loaded or not. */
export interface Packages {
  loaded: readonly LoadedPackage[]
  entries: readonly PackageEntry[]
}

/**
 * The built-ins, then the `packages` loaded, then the descriptors from
 * `sources`, each by name; `opts` is passed to each descriptor's plugin. A
 * descriptor that can't be used, that is named as a package in the config, or
 * whose `supersededBy` names neither a built-in plugin nor a package in the
 * config, is one of `problems`.
 *
 * @throws DescriptorLoadError for a descriptor folder that can't be read
 * @throws PackageError for a package entry named as a built-in plugin
 */
export function findPlugins(
  sources: DescriptorSources,
  opts: DescriptorOptions = {},
  packages: Packages = { loaded: [], entries: [] },
): Loaded {
  const builtIns = BUILT_IN_PLUGINS.map((d) => d.name)
  const clash = packages.entries.find((e) => builtIns.includes(e.name))
  if (clash !== undefined) {
    throw new PackageError(
      `plugins.${clash.name}.package: ${clash.name} is the built-in plugin; every plugin has its own name, so a package plugin needs another`,
    )
  }
  const code = [...builtIns, ...packages.entries.map((e) => e.name)]
  const found = findDescriptors(sources, builtIns)
  const problems = [...found.problems]
  const refused = (d: LoadedDescriptor, why: string): false => {
    problems.push({
      name: d.name,
      path: d.path,
      error: new DescriptorLoadError(`descriptor ${d.path}${why}`),
    })
    return false
  }
  const descriptors = found.descriptors.filter((d) => {
    const entry = packages.entries.find((e) => e.name === d.name)
    if (entry !== undefined) {
      return refused(
        d,
        ` is named ${d.name}, as the package plugins.${d.name}.package names (${entry.package}); every plugin has its own name, so rename the file`,
      )
    }
    const by = d.descriptor.supersededBy
    if (by === undefined || code.includes(by)) return true
    return refused(
      d,
      `: supersededBy ${by} is no built-in plugin and no package the config names; have ${code.join(', ')}`,
    )
  })
  const loaded = [...packages.loaded].sort(byName)
  return {
    definitions: [
      ...BUILT_IN_PLUGINS,
      ...loaded.map((p) => p.definition),
      ...descriptors.map((d) => descriptorPlugin(d.name, d.descriptor, opts)),
    ],
    packages: loaded,
    descriptors,
    problems,
  }
}

/**
 * {@link findPlugins}, with no problem allowed.
 *
 * @throws DescriptorLoadError for a descriptor named as a built-in plugin or a
 *   package in the config, a `supersededBy` that names neither, or as loadDescriptors
 * @throws DescriptorError for a descriptor file that can't be used
 * @throws PackageError as findPlugins
 */
export function loadPlugins(
  sources: DescriptorSources,
  opts: DescriptorOptions = {},
  packages: Packages = { loaded: [], entries: [] },
): Loaded {
  const loaded = findPlugins(sources, opts, packages)
  if (loaded.problems[0] !== undefined) throw loaded.problems[0].error
  return loaded
}

/** A `--plugin` or `--skip-plugin` that names no plugin. */
export class UnknownPlugin extends Error {
  override name = 'UnknownPlugin'
}

/**
 * `plugins` narrowed to `want` when given, less `skip`. A name no plugin has is
 * an error, except that `skip` may name one of `absent`, the descriptors that can't be used.
 *
 * @throws UnknownPlugin
 */
export function selectPlugins(
  plugins: readonly Plugin[],
  want: readonly string[] | undefined,
  skip: readonly string[] | undefined,
  absent: readonly string[] = [],
): Plugin[] {
  const known = new Set(plugins.map((p) => p.name))
  for (const name of [...(want ?? []), ...(skip ?? []).filter((n) => !absent.includes(n))]) {
    if (!known.has(name)) {
      throw new UnknownPlugin(`no plugin named ${name}; have ${[...known].join(', ')}`)
    }
  }
  return plugins.filter(
    (p) =>
      (want === undefined || want.length === 0 || want.includes(p.name)) && !skip?.includes(p.name),
  )
}
