import { accessSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'

import { parse as parseYaml } from 'yaml'

import type { AgentCallSpec, PermissionMode } from '../spec.js'
import { containedPath } from './contain.js'
import { UsageError } from './errors.js'
import type { InputValue } from './inputs.js'

export type PromptPart = { file: string } | { text: string } | { input: string }
export type ContextPart = { file: string } | { input: string }

/** The `run:` section of a spec file, plus the one `setup:` field the CLI reads. */
export interface RunFile {
  /** `setup.harness`, the default agent. */
  setupHarness?: string | undefined
  agent?: string | undefined
  model?: string | undefined
  maxTurns?: number | undefined
  strict: boolean
  permissions?: { mode?: PermissionMode; allowTools?: string[]; denyTools?: string[] } | undefined
  prompt: PromptPart[]
  context: ContextPart[]
}

const MODES: readonly string[] = ['read-only', 'default', 'edits', 'full-auto', 'bypass']
const RUN_KEYS = ['agent', 'model', 'maxTurns', 'strict', 'permissions', 'prompt', 'context']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stringList(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new UsageError(`${where} must be a list of strings`)
  }
  return v as string[]
}

function parts(v: unknown, where: string, keys: readonly string[]): Record<string, string>[] {
  if (!Array.isArray(v)) throw new UsageError(`${where} must be a list`)
  return v.map((item, i) => {
    if (!isRecord(item)) throw new UsageError(`${where}[${i}] must be a mapping`)
    const present = Object.keys(item)
    const key = present[0]
    if (present.length !== 1 || key === undefined || !keys.includes(key)) {
      throw new UsageError(`${where}[${i}] must have exactly one key of: ${keys.join(', ')}`)
    }
    const value = item[key]
    if (typeof value !== 'string') throw new UsageError(`${where}[${i}].${key} must be a string`)
    return { [key]: value }
  })
}

/** Parse YAML or JSON text (JSON by `.json` extension, else YAML) into a validated {@link RunFile}. */
export function parseSpecText(text: string, ext: string): RunFile {
  let doc: unknown
  try {
    doc = ext === '.json' ? JSON.parse(text) : parseYaml(text)
  } catch (err) {
    throw new UsageError(`cannot parse spec: ${(err as Error).message}`)
  }
  if (!isRecord(doc)) throw new UsageError('spec must be a mapping')
  const run = doc.run
  if (!isRecord(run)) throw new UsageError('spec has no run: section')
  for (const key of Object.keys(run)) {
    if (!RUN_KEYS.includes(key)) throw new UsageError(`unknown run.${key}`)
  }

  const out: RunFile = { strict: false, prompt: [], context: [] }
  if (isRecord(doc.setup) && typeof doc.setup.harness === 'string') {
    out.setupHarness = doc.setup.harness
  }
  if (run.agent !== undefined) {
    if (typeof run.agent !== 'string') throw new UsageError('run.agent must be a string')
    out.agent = run.agent
  }
  if (run.model !== undefined) {
    if (typeof run.model !== 'string') throw new UsageError('run.model must be a string')
    out.model = run.model
  }
  if (run.maxTurns !== undefined) {
    if (!Number.isInteger(run.maxTurns) || (run.maxTurns as number) < 1) {
      throw new UsageError('run.maxTurns must be a positive integer')
    }
    out.maxTurns = run.maxTurns as number
  }
  if (run.strict !== undefined) {
    if (typeof run.strict !== 'boolean') throw new UsageError('run.strict must be true or false')
    out.strict = run.strict
  }
  if (run.permissions !== undefined) {
    const p = run.permissions
    if (!isRecord(p)) throw new UsageError('run.permissions must be a mapping')
    for (const key of Object.keys(p)) {
      if (!['mode', 'allowTools', 'denyTools'].includes(key)) {
        throw new UsageError(`unknown run.permissions.${key}`)
      }
    }
    out.permissions = {}
    if (p.mode !== undefined) {
      if (typeof p.mode !== 'string' || !MODES.includes(p.mode)) {
        throw new UsageError(`run.permissions.mode must be one of: ${MODES.join(', ')}`)
      }
      out.permissions.mode = p.mode as PermissionMode
    }
    if (p.allowTools !== undefined) {
      out.permissions.allowTools = stringList(p.allowTools, 'run.permissions.allowTools')
    }
    if (p.denyTools !== undefined) {
      out.permissions.denyTools = stringList(p.denyTools, 'run.permissions.denyTools')
    }
  }
  out.prompt = parts(run.prompt, 'run.prompt', ['file', 'text', 'input']) as PromptPart[]
  if (out.prompt.length === 0) throw new UsageError('run.prompt needs at least one part')
  if (run.context !== undefined) {
    out.context = parts(run.context, 'run.context', ['file', 'input']) as ContextPart[]
  }
  return out
}

export function loadSpecFile(path: string): RunFile {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    throw new UsageError(`cannot read spec ${path}: ${(err as Error).message}`)
  }
  return parseSpecText(text, extname(path).toLowerCase())
}

/** Replace `{{name}}` with the input's value. An unknown name is an error. */
export function substitute(text: string, inputs: ReadonlyMap<string, InputValue>): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_m, name: string) => {
    const input = inputs.get(name)
    if (input === undefined) {
      throw new UsageError(`text part uses {{${name}}} but no --input ${name}=... was given`)
    }
    return input.value
  })
}

export interface ResolvedCall {
  spec: AgentCallSpec
  /** Fields of the run section the library's spec cannot express. */
  unsupported: { field: string; detail: string }[]
}

function requireInput(inputs: ReadonlyMap<string, InputValue>, name: string): InputValue {
  const input = inputs.get(name)
  if (input === undefined) {
    throw new UsageError(`missing required input "${name}" (--input ${name}=...)`)
  }
  return input
}

/** Build the library call spec from a parsed run section. Reads `file:` parts under `root`. */
export function resolveCall(
  run: RunFile,
  root: string,
  inputs: ReadonlyMap<string, InputValue>,
): ResolvedCall {
  const read = (rel: string): string => {
    const abs = containedPath(root, rel)
    try {
      return readFileSync(abs, 'utf8')
    } catch (err) {
      throw new UsageError(`cannot read ${rel}: ${(err as Error).message}`)
    }
  }
  const prompt = run.prompt
    .map((part) => {
      if ('file' in part) return read(part.file)
      if ('text' in part) return substitute(part.text, inputs)
      return requireInput(inputs, part.input).value
    })
    .join('\n\n')

  const files = run.context.map((part) => {
    if ('file' in part) {
      const abs = containedPath(root, part.file)
      try {
        accessSync(abs)
      } catch (err) {
        throw new UsageError(`cannot read ${part.file}: ${(err as Error).message}`)
      }
      return abs
    }
    const input = requireInput(inputs, part.input)
    if (input.path === undefined) {
      throw new UsageError(
        `context input "${part.input}" must be a file: pass --input ${part.input}=@path`,
      )
    }
    return input.path
  })

  // No cwd: the agent runs in the current directory (in CI, the pull request's
  // checkout), while `root` is the trusted checkout the spec and prompts come from.
  const spec: AgentCallSpec = { prompt }
  if (run.model !== undefined) spec.model = run.model
  if (run.permissions !== undefined) spec.permissions = run.permissions
  if (files.length > 0) spec.context = { files }

  if (run.maxTurns !== undefined) spec.limits = { maxTurns: run.maxTurns }

  const unsupported: ResolvedCall['unsupported'] = []
  return { spec, unsupported }
}
