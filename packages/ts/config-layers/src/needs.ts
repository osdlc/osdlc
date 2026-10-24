/**
 * What a command needs from the config before it can run, and the message an
 * unmet need gives. The message names the command, the key, what the key is
 * for (its schema description), and where to set it.
 *
 * A tool builds one {@link ConfigNeeds} from its two schemas. A command
 * declares `{ config: 'dotted.key' }`, optionally with an input that can be
 * given instead of the setting (`--endpoint` for `upload.endpoint`). It calls
 * `met` before its handler runs.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { z } from 'zod'

import type { MachineConfigFile } from './machine.ts'
import { keyDescription, leafSchema } from './schema.ts'
import { valueAt, valueIsSet } from './value.ts'

/**
 * A setting a command cannot run without.
 *
 * @experimental
 */
export interface ConfigNeed {
  /** Dotted path into the config: `upload.endpoint`, `paths.dev`. */
  config: string
  /**
   * An input key that can be given on the command line instead of the setting
   * (`endpoint` for `--endpoint`). The need is met when that input is present
   * and non-empty, whatever the config says.
   */
  unlessInput?: string
}

/**
 * Which files may carry a key.
 *
 * @experimental
 */
export interface KeyScopes {
  project: boolean
  machine: boolean
}

/**
 * Options for building the config-needs helpers: the tool name, the project file and schema, and the machine file.
 * @experimental
 */
export interface ConfigNeedsOptions<P extends z.ZodTypeAny, M extends z.ZodTypeAny> {
  /** The tool's command name, for the message (`tooly`). */
  tool: string
  /** The committed project file's name (`tooly.yaml`), looked for at the project root. */
  projectFile: string
  projectSchema: P
  /** The machine file; its schema says which keys it may carry. */
  machine: MachineConfigFile<M>
  /**
   * How to see the whole shape, appended to the message after a semicolon:
   * `` `tooly config scaffold` shows the full shape ``.
   */
  scaffoldHint?: string
}

/**
 * The config and command input used to decide whether a need is met.
 * @experimental
 */
export interface MetOptions {
  /** The parsed project config (all defaults filled). */
  project: unknown
  /** The raw command input, checked for the `unlessInput` key. */
  input?: Record<string, unknown> | undefined
}

/**
 * Options for the message that explains an unmet config need.
 * @experimental
 */
export interface MessageOptions {
  /** Where the project file would be; the message names it or says it is absent. */
  projectRoot: string
  /** The command's words after the tool name (`['upload', 'run']`); absent or empty → "this command". */
  command?: readonly string[] | undefined
}

/**
 * Helpers that answer where a config key belongs, whether a command's needs are met, and what to tell a person when they are not.
 * @experimental
 */
export interface ConfigNeeds {
  /** Which files' schemas carry `key`. */
  keyScopes(key: string): KeyScopes
  /** Whether either schema knows `key`. */
  keyExists(key: string): boolean
  /** The first sentence of either schema's description for `key`, or null. */
  keyDescription(key: string): string | null
  /** Whether `need` is met: the input is given, or the setting is set in either file. */
  met(need: ConfigNeed, opts: MetOptions): boolean
  /** The message for an unmet need. */
  message(need: ConfigNeed, opts: MessageOptions): string
  /**
   * Where `key` can be set, as prose: the files whose schema carries it. When
   * a project file exists at `projectRoot`, it comes first. Otherwise the
   * machine file comes first, and the project file is described instead of
   * given as a path, since there is no file to point at.
   */
  whereToSet(key: string, projectRoot: string): string
}

/**
 * Build the helpers that tell a person which file to edit when a key is missing, and whether a command's config needs are met.
 * @experimental
 */
export function configNeeds<P extends z.ZodTypeAny, M extends z.ZodTypeAny>(
  opts: ConfigNeedsOptions<P, M>,
): ConfigNeeds {
  const { tool, projectFile, projectSchema, machine, scaffoldHint } = opts
  const machineSchema = machine.schema

  const keyScopes = (key: string): KeyScopes => ({
    project: leafSchema(projectSchema, key) !== null,
    machine: leafSchema(machineSchema, key) !== null,
  })

  const whereToSet = (key: string, projectRoot: string): string => {
    const scopes = keyScopes(key)
    const inProject = existsSync(join(projectRoot, projectFile))
    const project = inProject
      ? join(projectRoot, projectFile)
      : `an ${projectFile} at the project root (none above ${projectRoot})`
    const machineText = `the machine config (${machine.path()})`
    if (scopes.machine && scopes.project) {
      return inProject ? `${project} or ${machineText}` : `${machineText} or ${project}`
    }
    return scopes.machine ? machineText : project
  }

  return {
    keyScopes,
    keyExists: (key) => {
      const scopes = keyScopes(key)
      return scopes.project || scopes.machine
    },
    keyDescription: (key) =>
      keyDescription(projectSchema, key) ?? keyDescription(machineSchema, key),
    met(need, { project, input }) {
      if (need.unlessInput !== undefined && valueIsSet(input?.[need.unlessInput])) return true
      if (valueIsSet(valueAt(project, need.config))) return true
      return valueIsSet(valueAt(machine.load(), need.config))
    },
    message(need, { projectRoot, command }) {
      const who =
        command === undefined || command.length === 0
          ? 'this command'
          : `\`${tool} ${command.join(' ')}\``
      const flag = need.unlessInput === undefined ? '' : ` (or pass --${toFlag(need.unlessInput)})`
      const what =
        keyDescription(projectSchema, need.config) ?? keyDescription(machineSchema, need.config)
      const hint = scaffoldHint === undefined ? '' : `; ${scaffoldHint}`
      return (
        `${who} needs \`${need.config}\`, and it is not set${flag}.` +
        (what === null ? '' : ` ${what}`) +
        ` Set it in ${whereToSet(need.config, projectRoot)}${hint}.`
      )
    },
    whereToSet,
  }
}

function toFlag(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}
