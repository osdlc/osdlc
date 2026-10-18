/**
 * Parses a YAML contract or config document and checks its envelope: `mcVersion` and `kind`.
 * Only `mcVersion: 2` is supported; `mcVersion: 1` gets an error that names the migration
 * command. The rest of the document goes to the compiler for its kind.
 */
import { parse as parseYaml } from 'yaml'

import { DeclarativeError } from './errors.js'

/** The supported versions of the YAML format. */
const SUPPORTED_VERSIONS = new Set([2])

/** A parsed YAML document whose envelope passed the checks. */
export interface DeclarativeDoc {
  mcVersion: number
  kind: 'contract' | 'config'
  /** the parsed YAML mapping, envelope validated */
  raw: Record<string, unknown>
}

/**
 * Parses YAML text and checks its envelope.
 *
 * @throws {DeclarativeError} On invalid YAML, a document that is not a mapping, an unsupported
 *   `mcVersion`, or a `kind` other than `contract` or `config`.
 */
export function parseDeclarativeDoc(yamlText: string): DeclarativeDoc {
  let raw: unknown
  try {
    raw = parseYaml(yamlText)
  } catch (err) {
    throw new DeclarativeError(`invalid YAML: ${(err as Error).message}`)
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DeclarativeError(
      'a declarative document must be a YAML mapping with mcVersion and kind',
    )
  }
  const obj = raw as Record<string, unknown>

  const version = obj.mcVersion
  if (version === 1) {
    throw new DeclarativeError(
      'mcVersion 1 is no longer supported; rewrite the file as mcVersion 2 with `markdown-contract migrate --write <file>` (the CLI of @osdlc/markdown-contract)',
    )
  }
  if (typeof version !== 'number' || !SUPPORTED_VERSIONS.has(version)) {
    throw new DeclarativeError(
      `unsupported mcVersion: ${JSON.stringify(version)} (this build supports ${[...SUPPORTED_VERSIONS].join(', ')})`,
    )
  }
  if (obj.kind !== 'contract' && obj.kind !== 'config') {
    throw new DeclarativeError(
      `kind must be "contract" or "config" (got ${JSON.stringify(obj.kind)})`,
    )
  }

  return { mcVersion: version, kind: obj.kind, raw: obj }
}
