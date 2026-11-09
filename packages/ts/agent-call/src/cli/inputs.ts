import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { UsageError } from './errors.js'

/** One `--input`: a literal value, or a file whose contents are the value. */
export interface InputValue {
  /** The text used in prompt parts. */
  value: string
  /** Absolute path, when the input came from `name=@path`. */
  path?: string | undefined
}

/**
 * Parse `--input` arguments. `name=value` is a literal. `name=@path` reads the
 * file (relative to `cwd`) for prompt use and keeps the path for context use.
 */
export function parseInputs(args: readonly string[], cwd: string): Map<string, InputValue> {
  const inputs = new Map<string, InputValue>()
  for (const arg of args) {
    const eq = arg.indexOf('=')
    if (eq <= 0) {
      throw new UsageError(`--input must look like name=value or name=@file, got "${arg}"`)
    }
    const name = arg.slice(0, eq)
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new UsageError(`invalid input name "${name}"`)
    if (inputs.has(name)) throw new UsageError(`input "${name}" given twice`)
    const rest = arg.slice(eq + 1)
    if (rest.startsWith('@')) {
      const path = resolve(cwd, rest.slice(1))
      let value: string
      try {
        value = readFileSync(path, 'utf8')
      } catch (err) {
        throw new UsageError(`input "${name}": cannot read ${path}: ${(err as Error).message}`)
      }
      inputs.set(name, { value, path })
    } else {
      inputs.set(name, { value: rest })
    }
  }
  return inputs
}
