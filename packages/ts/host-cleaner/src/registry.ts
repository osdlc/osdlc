/**
 * The plugins the command line knows, and the choice among them. Every
 * plugin, built in or a descriptor, has one name in one namespace.
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
import type { Plugin, PluginDefinition } from './types.ts'

export { BUILT_IN_PLUGINS }

/** A run's plugin definitions, and where each descriptor among them came from. */
export interface Loaded {
  /** The built-ins in run order, then one plugin per descriptor, by name. */
  definitions: readonly PluginDefinition[]
  /** Each descriptor used. */
  descriptors: readonly LoadedDescriptor[]
  /** The names whose descriptor can't be used; they have no definition. */
  problems: readonly DescriptorProblem[]
}

/**
 * The built-ins, then the descriptors from `sources` by name; `opts` is passed
 * to each descriptor's plugin. A descriptor that can't be used, or whose
 * `supersededBy` names no built-in plugin, is one of `problems`.
 *
 * @throws DescriptorLoadError for a descriptor folder that can't be read
 */
export function findPlugins(sources: DescriptorSources, opts: DescriptorOptions = {}): Loaded {
  const builtIns = BUILT_IN_PLUGINS.map((d) => d.name)
  const found = findDescriptors(sources, builtIns)
  const problems = [...found.problems]
  const descriptors = found.descriptors.filter((d) => {
    const by = d.descriptor.supersededBy
    if (by === undefined || builtIns.includes(by)) return true
    problems.push({
      name: d.name,
      source: d.source,
      path: d.path,
      error: new DescriptorLoadError(
        `descriptor ${d.path}: supersededBy ${by} is no built-in plugin; have ${builtIns.join(', ')}`,
      ),
    })
    return false
  })
  return {
    definitions: [
      ...BUILT_IN_PLUGINS,
      ...descriptors.map((d) => descriptorPlugin(d.name, d.descriptor, opts)),
    ],
    descriptors,
    problems,
  }
}

/**
 * {@link findPlugins}, with no problem allowed.
 *
 * @throws DescriptorLoadError for a descriptor named as a built-in plugin, a
 *   `supersededBy` that names no built-in plugin, or as loadDescriptors
 * @throws DescriptorError for a descriptor file that can't be used
 */
export function loadPlugins(sources: DescriptorSources, opts: DescriptorOptions = {}): Loaded {
  const loaded = findPlugins(sources, opts)
  if (loaded.problems[0] !== undefined) throw loaded.problems[0].error
  return loaded
}

/** A `--plugin` or `--skip-plugin` that names no plugin. */
export class UnknownPlugin extends Error {
  override name = 'UnknownPlugin'
}

/**
 * `plugins` narrowed to `want` when given, less `skip`. A name no plugin has is
 * an error. Anything with a name can be chosen, so a run chooses among its
 * plugins and its descriptors that can't be used together.
 *
 * @throws UnknownPlugin
 */
export function selectPlugins<P extends Pick<Plugin, 'name'>>(
  plugins: readonly P[],
  want: readonly string[] | undefined,
  skip: readonly string[] | undefined,
): P[] {
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
