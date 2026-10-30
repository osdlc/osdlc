/**
 * Runs the config-layers conformance suite's cases against this package.
 *
 * `packages/conformance/config-layers/suite.json` is the family's suite, and
 * this package is its reference implementation. `conformance-write.ts` calls
 * {@link run} to write each case's `expect` or `error`, and
 * `conformance.test.ts` calls it to check them, so the two cannot drift.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import { envVars } from '../src/dirs.ts'
import { readMappingFile } from '../src/loader.ts'
import { machineConfigFile } from '../src/machine.ts'
import { configNeeds } from '../src/needs.ts'
import { PathNameError, resolveConfigPath, substitutePathNames } from '../src/paths.ts'
import { valueAt, valueIsSet } from '../src/value.ts'

/** The suite file, by its path in the repository. */
export const SUITE_PATH = join(import.meta.dirname, '../../../conformance/config-layers/suite.json')

export interface Case {
  name: string
  input: Record<string, unknown>
  expect?: Record<string, unknown>
  error?: { kind: string; message?: string }
  platforms?: string[]
  skip?: Record<string, string>
}

export interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

/** What a case gives: its `expect`, or its `error`. */
export type Outcome =
  | { expect: Record<string, unknown> }
  | { error: { kind: string; message?: string } }

const CASE_KEYS = ['name', 'input', 'expect', 'error', 'platforms', 'skip']

/** The keys of `obj` that `known` does not list. */
function unknownKeys(obj: object, known: readonly string[]): string[] {
  return Object.keys(obj).filter((k) => !known.includes(k))
}

/**
 * Reads the suite, and fails on a key in the file, a section or a case that
 * this runner does not know, so nothing in it is ignored.
 */
export function readSuite(): Suite {
  const suite = JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite
  const problems = unknownKeys(suite, ['family', 'reference', 'referenceVersion', 'sections'])
  for (const [name, section] of Object.entries(suite.sections)) {
    if (!(name in SECTIONS)) problems.push(`section ${name}`)
    problems.push(...unknownKeys(section, ['description', 'cases']).map((k) => `${name}: ${k}`))
    for (const c of section.cases) {
      problems.push(...unknownKeys(c, CASE_KEYS).map((k) => `${name}: ${c.name}: ${k}`))
      if (c.error !== undefined) {
        problems.push(
          ...unknownKeys(c.error, ['kind', 'message']).map((k) => `${name}: ${c.name}: error.${k}`),
        )
      }
    }
  }
  if (problems.length > 0) throw new Error(`the suite has what this runner does not know: ${problems.join(', ')}`)
  return suite
}

/**
 * The fields of a case's input, checked against the ones its section takes:
 * a field missing from `required`, or one in neither list, throws.
 */
function fields<T>(input: Record<string, unknown>, required: string[], optional: string[] = []): T {
  const unknown = unknownKeys(input, [...required, ...optional])
  const missing = required.filter((k) => !(k in input))
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(`input: unknown ${unknown.join(', ') || '-'}; missing ${missing.join(', ') || '-'}`)
  }
  return input as T
}

interface KeyRow {
  key: string
  scope: 'project' | 'machine' | 'both'
  description: string
}

interface NeedsInput {
  tool: string
  project_file: string
  machine_path: string
  scaffold_hint?: string
  keys: KeyRow[]
  config: string
  unless_input?: string
  command: string[]
  project_file_exists: boolean
}

/** The unmet-need message for one `needs` case, with `{project_root}` for the root. */
function needsMessage(input: NeedsInput): string {
  const schema = (scopes: string[]): z.ZodObject =>
    z.object(
      Object.fromEntries(
        input.keys
          .filter((k) => scopes.includes(k.scope))
          .map((k) => [k.key, z.string().default('').describe(k.description)]),
      ),
    )
  const machine = machineConfigFile({
    tool: input.tool,
    schema: schema(['machine', 'both']),
    vendorDirs: { vendor: 'com.example', envVars: envVars('MYTOOL') },
  })
  const needs = configNeeds({
    tool: input.tool,
    projectFile: input.project_file,
    projectSchema: schema(['project', 'both']),
    machine,
    ...(input.scaffold_hint === undefined ? {} : { scaffoldHint: input.scaffold_hint }),
  })
  const root = mkdtempSync(join(tmpdir(), 'config-layers-conformance-'))
  const before = process.env[machine.env]
  process.env[machine.env] = input.machine_path
  try {
    if (input.project_file_exists) writeFileSync(join(root, input.project_file), '')
    const need =
      input.unless_input === undefined
        ? { config: input.config }
        : { config: input.config, unlessInput: input.unless_input }
    return needs
      .message(need, { projectRoot: root, command: input.command })
      .replaceAll(root, '{project_root}')
  } finally {
    if (before === undefined) delete process.env[machine.env]
    else process.env[machine.env] = before
    rmSync(root, { recursive: true, force: true })
  }
}

/** The mapping `yaml` reads as, or the kind of error it is. */
function readYaml(yaml: string): Outcome {
  const dir = mkdtempSync(join(tmpdir(), 'config-layers-conformance-'))
  try {
    const file = join(dir, 'config.yaml')
    writeFileSync(file, yaml)
    const read = readMappingFile(file)
    if (read.problem === null) return { expect: { mapping: read.data } }
    if (read.problem.startsWith('YAML parse error: ')) return { error: { kind: 'invalid_yaml' } }
    if (read.problem === 'top level must be a mapping') return { error: { kind: 'not_a_mapping' } }
    throw new Error(`a problem the suite has no kind for: ${read.problem}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Each section's runner: a case's input to what this package gives. */
const SECTIONS: Record<string, (input: Record<string, unknown>) => Outcome> = {
  value_is_set(raw) {
    const input = fields<{ value?: unknown; missing?: true }>(raw, [], ['value', 'missing'])
    if (('value' in input) === (input.missing === true)) {
      throw new Error('input: give exactly one of value and missing: true')
    }
    return { expect: { set: valueIsSet(input.missing === true ? undefined : input.value) } }
  },
  value_at(raw) {
    const input = fields<{ obj: unknown; key: string }>(raw, ['obj', 'key'])
    const got = valueAt(input.obj, input.key)
    return { expect: got === undefined ? { found: false } : { found: true, value: got } }
  },
  yaml(raw) {
    return readYaml(fields<{ yaml: string }>(raw, ['yaml']).yaml)
  },
  resolve_config_path(raw) {
    const input = fields<{ value: string; base_dir: string; home: string }>(raw, [
      'value',
      'base_dir',
      'home',
    ])
    return { expect: { path: resolveConfigPath(input.value, input.base_dir, { home: input.home }) } }
  },
  substitute_path_names(raw) {
    const input = fields<{
      value: string
      names: Record<string, string>
      setting: string
      define_hint?: string
    }>(raw, ['value', 'names', 'setting'], ['define_hint'])
    const opts = input.define_hint === undefined ? {} : { defineHint: input.define_hint }
    try {
      return { expect: { text: substitutePathNames(input.value, input.names, input.setting, opts) } }
    } catch (e) {
      if (!(e instanceof PathNameError)) throw e
      return { error: { kind: 'unknown_path_name', message: e.message } }
    }
  },
  needs(raw) {
    const input = fields<NeedsInput>(
      raw,
      ['tool', 'project_file', 'machine_path', 'keys', 'config', 'command', 'project_file_exists'],
      ['scaffold_hint', 'unless_input'],
    )
    return { expect: { message: needsMessage(input) } }
  },
}

/** The names of the sections this runner runs. */
export const SECTION_NAMES = Object.keys(SECTIONS)

/** What `section`'s case with `input` gives in this package. */
export function run(section: string, input: Record<string, unknown>): Outcome {
  const runner = SECTIONS[section]
  if (runner === undefined) throw new Error(`a section this implementation lacks: ${section}`)
  return runner(input)
}
