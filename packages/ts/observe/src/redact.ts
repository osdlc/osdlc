/**
 * The redact entry: a deterministic filter that replaces secrets in text and
 * JSON before a log writer puts them on disk, and the JSONL writer with that
 * filter in front of it. secretlint, which it uses, loads on the first text
 * that could hold a secret, not when this entry is imported.
 */

export {
  createRedactor,
  mergeRedactions,
  type Redacted,
  type RedactionRange,
  type Redactions,
  type Redactor,
  type RedactorOptions,
} from './redactor.ts'

export { redactPatternProblem } from './redact-pattern.ts'

export { appendRedactedJsonl } from './redacted-writer.ts'
