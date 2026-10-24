/**
 * Compiles a YAML contract into the same `Contract` that `contract(...)` builds from code,
 * so a YAML contract gives the same findings and the same typed model.
 *
 * It compiles the **frontmatter** schema (a JSON Schema subset, `schema-v2.ts` → Zod), the
 * **body grammar** (`body-v2.ts` → the builders) and the root `description` (the outermost
 * hint for findings). `mcVersion: 2` is the only supported version. Custom `rule` / `docRule`
 * functions have no YAML form.
 */
import { readFileSync } from 'node:fs'

import { contract } from '../core/grammar.js'
import type { Contract, ContractDef } from '../core/types.js'
import { compileBodyV2 } from './body-v2.js'
import { DeclarativeError } from './errors.js'
import { parseDeclarativeDoc } from './parse.js'
import { compileObjectSchemaV2 } from './schema-v2.js'
import { compileBodyTextRule } from './text.js'

/**
 * Compiles the text of a YAML contract (`mcVersion: 2`, `kind: contract`) into a `Contract`.
 *
 * @param yamlText The contract's YAML text.
 * @returns The compiled contract.
 * @throws {DeclarativeError} When the YAML is not a valid contract, including an `mcVersion: 1` file.
 * @example
 * ```ts
 * const c = loadContract(`
 * mcVersion: 2
 * kind: contract
 * body:
 *   sections:
 *     - section: Summary
 * `);
 * c.validate('## Summary\n\nHello.\n', { path: 'doc.md' }).findings; // []
 * ```
 */
export function loadContract(yamlText: string): Contract {
  const doc = parseDeclarativeDoc(yamlText)
  if (doc.kind !== 'contract') {
    throw new DeclarativeError(
      `expected a contract document (kind: contract), got kind: ${doc.kind}`,
    )
  }
  return compileContractObject(doc.raw)
}

/**
 * Reads a `*.contract.yaml` file and compiles it, as {@link loadContract} does.
 *
 * @param path The contract file's path.
 * @returns The compiled contract.
 * @throws {DeclarativeError} When the YAML is not a valid contract.
 * @throws {Error} When the file cannot be read.
 */
export function loadContractFile(path: string): Contract {
  return loadContract(readFileSync(path, 'utf8'))
}

/**
 * Compiles a contract that is already parsed into an object, such as an inline contract in
 * a config. The object has the shape of a contract file, `{ description?, frontmatter?, body? }`,
 * and may keep its `mcVersion: 2` / `kind: contract` envelope.
 *
 * @param raw The contract object.
 * @returns The compiled contract.
 * @throws {DeclarativeError} When the object is not a valid contract, including one whose
 *   `mcVersion` is not 2.
 */
export function compileContractObject(raw: Record<string, unknown>): Contract {
  if ('mcVersion' in raw && raw.mcVersion !== 2) {
    throw new DeclarativeError(
      `contract: unsupported mcVersion ${JSON.stringify(raw.mcVersion)} (only 2 is supported; ` +
        'rewrite a version 1 contract with `markdown-contract migrate`)',
    )
  }
  assertContractKeys(raw)
  const def: ContractDef = {}

  if (raw.description !== undefined) {
    if (typeof raw.description !== 'string') {
      throw new DeclarativeError('contract: description must be a string')
    }
    def.description = raw.description
  }

  if (raw.frontmatter !== undefined) {
    def.frontmatter = compileObjectSchemaV2(raw.frontmatter, 'frontmatter')
  }

  if (raw.body !== undefined) {
    def.body = compileBodyV2(raw.body)
    attachBodyTextRule(def, raw.body)
  }

  return contract(def)
}

/** Throws on any top-level key other than the envelope, `frontmatter`, `body` and `description`. */
function assertContractKeys(raw: Record<string, unknown>): void {
  const allowed = new Set(['mcVersion', 'kind', 'frontmatter', 'body', 'description'])
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new DeclarativeError(`contract: unknown key '${key}'`)
    }
  }
}

/**
 * Compiles `requires:` and `forbids:` on the body (next to `sections:`) into one `textRule`
 * document rule. The body grammar (`SectionSeq`, `LevelOpts`) has no place for it, so it goes in
 * the contract's `rules`. `compileBodyV2` has already checked that `body` is a mapping.
 */
function attachBodyTextRule(def: ContractDef, body: unknown): void {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const docRule = compileBodyTextRule(body as Record<string, unknown>)
    if (docRule) (def.rules ??= []).push(docRule)
  }
}
