/**
 * Config sections. A tool's config schema is built from sections, one per
 * top-level key. Each section module exports one section made by
 * {@link defineConfigSection}. The tool lists them in key order and hands the
 * list to {@link assembleConfig} (`./loader.ts`), which builds the schema, the
 * loader and the single-file schema from it.
 *
 * A section module must not import values from the module that assembles the
 * list. That module imports the sections and builds the schema when it is
 * evaluated, so an import back from a section creates an import cycle.
 */

import type { z } from 'zod'

import type { ConfigIssue } from './config-error.ts'
import { PROJECT_LAYER, type ConfigKeyMeta, type MetaTerms } from './meta.ts'
import { SECRET_ALLOWED_LAYERS, secretKeysSet, sectionSecretPaths } from './secret.ts'

/**
 * What a section's {@link ConfigSectionHooks.layerCheck} receives after the
 * merged config parses: the section's value in each raw layer (before the
 * merge, `undefined` when the layer does not set it), its parsed merged value,
 * and the project root the file belongs to.
 * @experimental
 */
export interface LayerCheckContext<V> {
  /** The directory the config file belongs to. */
  projectRoot: string
  /** This section's raw value in the project file, or `undefined`. */
  project: unknown
  /** This section's raw value in the overlay, or `undefined`. */
  local: unknown
  /** This section's parsed value in the merged config; `undefined` when checking a raw file alone ({@link projectLayerIssues}). */
  value: V | undefined
}

/**
 * Optional per-section hooks. Only hooks something reads are declared; add one
 * here when a reader exists, not before.
 * @experimental
 */
export interface ConfigSectionHooks<S extends z.ZodType = z.ZodType> {
  /**
   * The schema used when one file is validated alone (the project file or the
   * overlay), in place of {@link ConfigSection.schema}. Some schemas check
   * across fields that a project may split between the two files. Such a
   * section supplies its un-refined variant here, so one file's partial content
   * is not reported as wrong. When absent, the section's schema is used.
   */
  fileSchema?: z.ZodType
  /**
   * Rules that need to know which layer set a value, checked after the merged
   * config parses (for example a value the committed file must not set).
   * Returns the issues found. A non-empty result refuses the config.
   */
  layerCheck?(ctx: LayerCheckContext<z.output<S>>): ConfigIssue[]
}

/**
 * One top-level config key: its name, schema (carrying its `.meta()`), and meta.
 * `T` is the vocabulary's terms when the section came from a vocabulary's
 * `defineSection` (`./vocabulary.ts`), plain strings otherwise.
 * @experimental
 */
export interface ConfigSection<
  K extends string = string,
  S extends z.ZodType = z.ZodType,
  T extends MetaTerms = MetaTerms,
> extends ConfigSectionHooks<S> {
  readonly key: K
  readonly schema: S
  readonly meta: ConfigKeyMeta<T>
}

/**
 * Define a section. The meta is registered on the schema as the last call on
 * its chain (`./meta.ts` explains why it must be last), so callers pass the
 * schema with its `.describe()` prose and the meta separately.
 * @experimental
 */
export function defineConfigSection<const K extends string, S extends z.ZodType>(
  section: ConfigSectionHooks<S> & { key: K; schema: S; meta: ConfigKeyMeta },
): ConfigSection<K, S> {
  const schema = section.schema.meta(section.meta)
  const secretPaths = sectionSecretPaths({ key: section.key, schema, meta: section.meta })
  // A key whose meta does not list the project layer is local-only: a repository
  // must not be able to set it, so the committed file carrying it is refused.
  const projectBarred = !section.meta.layers.includes(PROJECT_LAYER)
  if (secretPaths.length === 0 && !projectBarred) return { ...section, schema }
  const own = section.layerCheck
  return {
    ...section,
    schema,
    layerCheck: (ctx) => [
      ...(projectBarred ? projectBarredIssues(section.key, section.meta, ctx.project) : []),
      ...secretIssues(section.key, ctx.project, secretPaths),
      ...(own?.(ctx) ?? []),
    ],
  }
}

/** One issue when the project file sets a key that is not allowed in it. */
function projectBarredIssues(key: string, meta: ConfigKeyMeta, project: unknown): ConfigIssue[] {
  if (project === undefined) return []
  return [
    {
      path: key,
      message: `this key cannot be set in the project file; set it in ${meta.layers.join(' or ')}`,
    },
  ]
}

/** One issue per secret path the project file sets, each naming its key and the layers that may hold it. */
function secretIssues(
  key: string,
  project: unknown,
  paths: readonly (readonly string[])[],
): ConfigIssue[] {
  if (typeof project !== 'object' || project === null) return []
  return secretKeysSet({ [key]: project }, paths).map((path) => ({
    path,
    message: `a secret value cannot be set in the project file; set it in ${SECRET_ALLOWED_LAYERS}`,
  }))
}

/**
 * Run every section's {@link ConfigSectionHooks.layerCheck}, including the
 * checks defineConfigSection adds, and collect the issues. The checks run only
 * here. The loader calls it with the parsed merged `value`, and
 * {@link projectLayerIssues} calls it without.
 */
export function layerCheckIssues(
  sections: readonly ConfigSection[],
  ctx: {
    projectRoot: string
    project: Record<string, unknown> | null
    local: Record<string, unknown> | null
    value?: Record<string, unknown>
  },
): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  for (const section of sections) {
    if (section.layerCheck === undefined) continue
    issues.push(
      ...section.layerCheck({
        projectRoot: ctx.projectRoot,
        project: ctx.project?.[section.key],
        local: ctx.local?.[section.key],
        value: ctx.value?.[section.key],
      }),
    )
  }
  return issues
}

/**
 * The layer checks over a raw project file read on its own, with no merged
 * config. For diagnostics that must name a problem before (or without) loading.
 * `LayerCheckContext.value` is `undefined` here, so a check that needs the
 * merged value reports nothing. Only checks the file alone can answer run.
 * @experimental
 */
export function projectLayerIssues(
  sections: readonly ConfigSection[],
  projectRoot: string,
  project: Record<string, unknown> | null,
): ConfigIssue[] {
  return layerCheckIssues(sections, { projectRoot, project, local: null })
}
