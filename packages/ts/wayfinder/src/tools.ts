/**
 * Custom tools: modules that export `ToolDef`s, registered beside the
 * built-ins. A module is code, so where it was named decides whether it loads:
 *
 *   --config <module>      always; you typed it
 *   user config `tools`    always; it is your own file
 *   project file `tools`   only when the repository is trusted and execution
 *                          is allowed, since the repository wrote it
 *
 * A module exports `tools` (an array), or a default that is an array or has
 * `tools`.
 */

import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { BUILTIN_TOOL_IDS } from '@osdlc/system-model/builtins'
import type { ToolDef } from '@osdlc/system-model/detect'

import { BIN } from './app.ts'
import type { LoadedConfig } from './config.ts'
import { expandTilde } from './xdg.ts'

/** A tool module that could not be loaded or does not export tools. */
export class ToolModuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolModuleError'
  }
}

/** One registered tool and where it came from. */
export interface LoadedTool {
  def: ToolDef
  /** The module path it was loaded from. */
  module: string
}

function isToolDef(value: unknown): value is ToolDef {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['id'] === 'string' && typeof v['roles'] === 'object' && v['roles'] !== null
}

/** Import one module and return its `ToolDef`s. Throws {@link ToolModuleError}. */
export async function loadToolModule(path: string): Promise<ToolDef[]> {
  let mod: { tools?: unknown; default?: unknown }
  try {
    mod = (await import(pathToFileURL(path).href)) as typeof mod
  } catch (err) {
    throw new ToolModuleError(
      `${path}: cannot be loaded: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  const fromDefault = Array.isArray(mod.default)
    ? mod.default
    : (mod.default as { tools?: unknown } | undefined)?.tools
  const list = mod.tools ?? fromDefault
  if (!Array.isArray(list)) {
    throw new ToolModuleError(`${path}: export \`tools\`, an array of ToolDefs`)
  }
  const bad = list.findIndex((t) => !isToolDef(t))
  if (bad !== -1) {
    throw new ToolModuleError(`${path}: tools[${bad}] is not a ToolDef (needs an id and roles)`)
  }
  return list as ToolDef[]
}

/** Where tool modules were named, already split by layer. */
export interface ToolSources {
  /** `--config` values, relative to `cwd`. */
  flag: readonly string[]
  cwd: string
  config: LoadedConfig
  home: string
  /** Whether project-file entries may load: the repository is trusted and execution is allowed. */
  projectAllowed: boolean
}

/**
 * Load every tool module the sources name, in order: flags, user file,
 * project file. Returns the tools, plus a warning when project entries are
 * skipped because the repository is not trusted or execution is off. A tool id
 * that is built in or defined twice throws {@link ToolModuleError}.
 */
export async function loadTools(
  sources: ToolSources,
): Promise<{ tools: LoadedTool[]; warnings: string[] }> {
  const { config, home } = sources
  const paths: string[] = []
  const at = (base: string, p: string) => resolve(base, expandTilde(p, home))
  for (const p of sources.flag) paths.push(at(sources.cwd, p))
  for (const p of config.layers.user?.tools ?? []) {
    paths.push(at(dirname(config.locations.user), p))
  }
  const warnings: string[] = []
  const projectTools = config.layers.project?.tools ?? []
  if (projectTools.length > 0) {
    if (sources.projectAllowed) {
      for (const p of projectTools) paths.push(at(dirname(config.locations.project), p))
    } else {
      warnings.push(
        `${config.locations.project}: tools not loaded — they need a trusted repository ("${BIN} trust") with execution allowed`,
      )
    }
  }
  const tools: LoadedTool[] = []
  const builtin = new Set<string>(BUILTIN_TOOL_IDS)
  for (const module of new Set(paths)) {
    for (const def of await loadToolModule(module)) {
      if (builtin.has(def.id)) {
        throw new ToolModuleError(`${module}: tool "${def.id}" is already a built-in tool`)
      }
      const first = tools.find((t) => t.def.id === def.id)
      if (first !== undefined) {
        throw new ToolModuleError(
          `tool "${def.id}" is defined twice: in ${first.module} and in ${module}`,
        )
      }
      tools.push({ def, module })
    }
  }
  return { tools, warnings }
}
