/**
 * Compiles a YAML config (`kind: config`) into the runner's `CorpusConfig`. It is the data
 * form of `defineConfig({ rules })`: a `rules` list that maps `include` / `exclude` globs to
 * a contract, plus an optional `contracts` name map.
 *
 * A contract ref is a `.yaml` contract file (resolved against the config's folder) or an
 * inline contract object. A ref to a `.js` / `.ts` contract module is rejected.
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import type { Contract } from '../core/types.js'
import type { CorpusConfig } from '../runner/index.js'
import { DeclarativeError } from './errors.js'
import { compileContractObject, loadContractFile } from './load.js'
import { parseDeclarativeDoc } from './parse.js'

const isMap = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Compiles the text of a YAML config (`kind: config`) into a `CorpusConfig` for
 * `runCorpus`.
 *
 * @param yamlText The config's YAML text.
 * @param baseDir The folder that relative contract paths resolve against.
 * @returns The rules, each with a compiled contract.
 * @throws {DeclarativeError} When the YAML is not a valid config, or a contract it names is not valid.
 * @throws {Error} When a contract file it names cannot be read.
 */
export function loadConfig(yamlText: string, baseDir: string): CorpusConfig {
  const doc = parseDeclarativeDoc(yamlText)
  if (doc.kind !== 'config') {
    throw new DeclarativeError(`expected a config document (kind: config), got kind: ${doc.kind}`)
  }
  return compileConfig(doc.raw, baseDir)
}

/**
 * Reads a YAML config file and compiles it, as {@link loadConfig} does. Contract paths
 * resolve against the file's folder.
 *
 * @param path The config file's path.
 * @returns The rules, each with a compiled contract.
 * @throws {DeclarativeError} When the YAML is not a valid config, or a contract it names is not valid.
 * @throws {Error} When the file, or a contract file it names, cannot be read.
 */
export function loadConfigFile(path: string): CorpusConfig {
  const abs = resolve(path)
  return loadConfig(readFileSync(abs, 'utf8'), dirname(abs))
}

function compileConfig(raw: Record<string, unknown>, baseDir: string): CorpusConfig {
  const contracts = isMap(raw.contracts) ? raw.contracts : {}
  if (!Array.isArray(raw.rules)) {
    throw new DeclarativeError('config.rules must be a list of { include, exclude?, contract }')
  }
  const rules = raw.rules.map((r, i) => compileRule(r, `rules[${i}]`, contracts, baseDir))
  return { rules }
}

function compileRule(
  rule: unknown,
  path: string,
  contracts: Record<string, unknown>,
  baseDir: string,
): { include: string[]; exclude?: string[]; contract: Contract; name?: string } {
  if (!isMap(rule)) throw new DeclarativeError(`${path}: a rule must be a mapping`)
  if (
    !Array.isArray(rule.include) ||
    rule.include.length === 0 ||
    !rule.include.every((g) => typeof g === 'string')
  ) {
    throw new DeclarativeError(`${path}.include must be a non-empty list of globs`)
  }
  const out: { include: string[]; exclude?: string[]; contract: Contract; name?: string } = {
    include: rule.include as string[],
    contract: resolveContract(rule.contract, `${path}.contract`, contracts, baseDir),
    // A string contract ref IS the human contract name (e.g. `capability`, `task`) — carry it as the
    // rule's label for the CLI run summary. Inline contract objects have no name, so leave it unset.
    ...(typeof rule.contract === 'string' ? { name: rule.contract } : {}),
  }
  if ('exclude' in rule) {
    if (!Array.isArray(rule.exclude) || !rule.exclude.every((g) => typeof g === 'string')) {
      throw new DeclarativeError(`${path}.exclude must be a list of globs`)
    }
    out.exclude = rule.exclude as string[]
  }
  return out
}

function resolveContract(
  ref: unknown,
  path: string,
  contracts: Record<string, unknown>,
  baseDir: string,
): Contract {
  if (ref === undefined)
    throw new DeclarativeError(
      `${path}: a rule needs a contract (a name, a .yaml path, or an inline contract)`,
    )
  if (isMap(ref)) {
    // An inline contract object (frontmatter? / body?) — no envelope of its own; it compiles
    // with the v2 compiler set, like everything else. A referenced .yaml file keeps
    // its own envelope.
    return compileContractObject(ref)
  }
  if (typeof ref !== 'string') {
    throw new DeclarativeError(
      `${path}: contract must be a name, a .yaml path, or an inline contract`,
    )
  }
  // A name resolves through the `contracts` map; otherwise the string is itself a path.
  const target = typeof contracts[ref] === 'string' ? (contracts[ref] as string) : ref
  if (!/\.ya?ml$/i.test(target)) {
    throw new DeclarativeError(
      `${path}: a contract ref must be a .yaml file (got '${target}'); referencing a code-authored .js/.ts contract is not supported`,
    )
  }
  return loadContractFile(isAbsolute(target) ? target : resolve(baseDir, target))
}
