/**
 * The log redactor: a deterministic filter for text and parsed JSON before a
 * log writer puts it on disk.
 *
 * Always on. Options can only EXTEND it (`envNames`, `extraPatterns`); nothing
 * here turns a rule off, and neither can the text: a `secretlint-disable`
 * comment in it is ignored. {@link Redacted} is a branded string only this module
 * mints, so a writer that declares its content field `Redacted` rejects a
 * plain string at compile time. A cast still gets past the
 * types, and `appendJsonl` takes any value: write free text through
 * `appendRedactedJsonl`, or redact it first.
 *
 * Four passes each collect `[start, end)` ranges over the ORIGINAL text:
 * secretlint's recommended preset, the built-in rules, the values of
 * secret-named environment variables, and configured extra patterns. Ranges
 * are merged (overlapping or adjacent ranges become one, keeping the rule id
 * of the earliest start) and spliced right to left as `[REDACTED:<rule>]`.
 *
 * The matched text is never logged or returned: callers get only per-rule
 * counts. Every built-in regex is bounded (no nested unbounded groups, bounded
 * quantifiers where a start position could rescan a long run), and the PEM
 * rule is a linear `indexOf` scan, so a hostile 100 KiB input cannot stall a
 * writer. If secretlint throws, the whole text is replaced: failing closed
 * beats failing open. The same applies to any other error inside a pass.
 *
 * Known limits, accepted: a context-free 40-character AWS secret key (no key
 * name or access key id nearby) is indistinguishable from any other base64
 * string and survives; a secret split across a line wrap is not matched; and a
 * caller-supplied `extraPatterns` regex runs unbounded (see the option doc).
 */

import { redactPatternProblem } from './redact-pattern.ts'

/**
 * Text that has passed {@link Redactor.redact}. Only the redactor mints it, so
 * a field typed `Redacted` refuses a plain string at compile time.
 */
export type Redacted = string & { readonly __brand: 'Redacted' }

/**
 * How many matches each rule replaced, by rule id: a secretlint rule id
 * without its `@secretlint/secretlint-rule-` prefix, a built-in rule
 * (`private-key`, `jwt`, `provider-key`, `connection-password`, `auth-scheme`,
 * `auth-digest`, `cookie`, `bearer`, `assigned-secret`, `high-entropy`),
 * `env:<NAME>` for an environment value, `custom:<id>` for an extra pattern,
 * or `redactor-error` when a pass failed and the whole text was replaced.
 */
export type Redactions = Record<string, number>

/** `[start, end)` over the original text, with the id of the rule that matched. */
export type RedactionRange = readonly [start: number, end: number, rule: string]

/** What {@link createRedactor} scrubs beyond its built-in rules. */
export interface RedactorOptions {
  /** Environment whose secret-named values are scrubbed. Default `process.env`. */
  env?: Record<string, string | undefined>
  /** Extra env var NAMES whose values are scrubbed, whatever they are called. */
  envNames?: string[]
  /**
   * Extra patterns (JS regex source); reported as `custom:<id>`. Obviously
   * catastrophic shapes (a group holding an unbounded quantifier that is itself
   * repeated, such as `(x+)+`) are rejected at creation; see
   * {@link redactPatternProblem}. That is a heuristic, not a proof: a pattern
   * can still backtrack badly, so keep custom patterns simple and bounded.
   */
  extraPatterns?: { id: string; regex: string }[]
  /**
   * Replaces secretlint, for a test that must reach the fail-closed path.
   * Returns `[start, end, ruleId]` ranges.
   */
  lint?: (text: string) => Promise<readonly RedactionRange[]>
}

/** A redactor built by {@link createRedactor}. Neither method throws. */
export interface Redactor {
  /**
   * Replace each secret in `text` with `[REDACTED:<rule>]`. When a pass fails,
   * the whole text becomes `[REDACTED:redactor-error]`.
   */
  redact(text: string): Promise<{ text: Redacted; redactions: Redactions }>
  /**
   * Redact every string in a parsed JSON value, object keys included. A
   * non-empty string or an object under a secret-named key (`password`,
   * `token`, `apiKey`, `cookie`, `authorization`, `auth`...) is replaced
   * whole, and so is a string under `session`; numbers and booleans are kept.
   * A `Date` becomes its ISO string, an `Error` its name, message and stack,
   * a `Map` an object, a `Set` an array and a `BigInt` its decimal string.
   * Functions (an own `toJSON` included) and symbols are dropped, as JSON drops
   * them, so nothing runs at write time. Two keys that redact to the same text
   * are kept apart as `key`, `key#2`... A cycle becomes `[Circular]`, and
   * nesting deeper than 64 levels `[MaxDepth]`.
   */
  redactJson(value: unknown): Promise<{ value: unknown; redactions: Redactions }>
}

/** Name segments (split on `_`/`-`) that mark an env var as secret. */
const ENV_SECRET_SEGMENTS = new Set([
  'KEY',
  'TOKEN',
  'SECRET',
  'PASSWORD',
  'PASSWD',
  'PASS',
  'CREDENTIAL',
  'CREDENTIALS',
  'AUTH',
  'PRIVATE',
])
/** Names that look secret but hold a path or socket, not a secret. */
const ENV_DENY_NAMES = new Set(['SSH_AUTH_SOCK', 'GPG_AGENT_INFO'])
const ENV_DENY_TAILS = new Set(['PATH', 'FILE', 'SOCK', 'DIR'])
const MAX_JSON_DEPTH = 64
const ENV_MIN_LENGTH = 8
const FAILED_CLOSED = '[REDACTED:redactor-error]'
const SECRETLINT_PREFIX = '@secretlint/secretlint-rule-'
const ENTROPY_MIN = 4.0
/** An unterminated PEM block is redacted to its end, up to this many chars. */
const PEM_OPEN_CAP = 16384

type Lint = (text: string) => Promise<RedactionRange[]>

let secretlint: Promise<Lint> | undefined

/**
 * secretlint, loaded on the first text that could hold a secret, so importing
 * this entry stays cheap. A load failure rejects, so that call fails closed, and
 * is forgotten, so the next call tries again.
 */
function loadSecretlint(): Promise<Lint> {
  secretlint ??= Promise.all([
    import('@secretlint/core'),
    import('@secretlint/secretlint-rule-preset-recommend'),
  ]).then(([{ lintSource }, { rules }]) => {
    // The preset's rules one by one, as the preset itself registers them, minus its comment
    // filter: a `secretlint-disable` comment in the text being logged must not switch a rule off.
    const config = {
      rules: rules
        .filter((rule) => rule.meta.id !== LINT_COMMENT_FILTER)
        .map((rule) => ({ id: rule.meta.id, rule })),
    }
    return async (text: string) => {
      const result = await lintSource({
        source: {
          content: sameOffsets(text),
          filePath: '/log.txt',
          ext: '.txt',
          contentType: 'text',
        },
        options: { config },
      })
      // Never read `message.message`: it echoes the secret.
      return result.messages.map((m): RedactionRange => [
        m.range[0],
        m.range[1],
        m.ruleId.replace(SECRETLINT_PREFIX, ''),
      ])
    }
  })
  secretlint.catch(() => {
    secretlint = undefined
  })
  return secretlint
}

/** The preset's rule that obeys `secretlint-disable` comments. Left out of the config. */
export const LINT_COMMENT_FILTER = '@secretlint/secretlint-rule-filter-comments'

/**
 * `text` with a leading byte-order mark turned into a space, so secretlint's ranges index the
 * original: secretlint drops the mark before it counts offsets.
 */
function sameOffsets(text: string): string {
  return text.startsWith('\uFEFF') ? ` ${text.slice(1)}` : text
}

/**
 * Whether secretlint can find anything in `text`. Every shape in its recommended preset is a
 * contiguous token of 16+ characters, a `://` connection string or a `-----BEGIN` block, so
 * short keys and prose of short words (most of a transcript line) skip the ~7 ms lint call.
 */
const LINT_CANDIDATE = /\S{16}|:\/\/|-----/

async function secretlintRanges(text: string): Promise<RedactionRange[]> {
  if (!LINT_CANDIDATE.test(text)) return []
  return (await loadSecretlint())(text)
}

// ── built-in rules ──────────────────────────────────────────────────────────

/** A regex whose capture group 1 is the secret (the rest is context to keep). */
interface GroupRule {
  id: string
  re: RegExp
  /** Extra filter on the captured value. */
  accept?: (value: string) => boolean
  /** Extra filter on an unquoted captured value (last capture group only). */
  acceptBare?: (value: string, match: string) => boolean
  /** Trailing characters trimmed off an unquoted captured value (last capture group only). */
  trim?: RegExp
}

const GROUP_RULES: GroupRule[] = [
  {
    id: 'jwt',
    re: /(eyJ[A-Za-z0-9_-]{5,200}\.eyJ[A-Za-z0-9_-]{5,4000}\.[A-Za-z0-9_-]{5,600})/dg,
  },
  {
    // Provider API keys the preset's strict shapes can miss (it also needs the
    // AWS secret beside an access key id before it reports either).
    id: 'provider-key',
    re: /\b(sk-(?:ant-|proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}\b)/dg,
  },
  {
    id: 'connection-password',
    re: /[A-Za-z][A-Za-z0-9+.-]{1,20}:\/\/[^\s:@/]{1,100}:([^\s@/]{1,200})@/dg,
  },
  {
    id: 'auth-scheme',
    re: /\b(?:proxy-)?authorization["']?\s{0,4}[:=]\s{0,4}["']?(?:basic|bearer|token)\s{1,5}([^\s"']{6,})/dgi,
  },
  {
    id: 'auth-digest',
    re: /\b(?:proxy-)?authorization["']?\s{0,4}[:=]\s{0,4}["']?digest\s{1,5}([^\r\n]{6,400})/dgi,
  },
  {
    id: 'cookie',
    re: /\b(?:set-)?cookie["']?\s{0,4}[:=]\s{0,4}["']?([^\r\n"']{6,2000})/dgi,
  },
  {
    id: 'bearer',
    re: /\bbearer\s{1,5}([A-Za-z0-9._~+/=-]{8,})/dgi,
  },
  {
    id: 'assigned-secret',
    // Key name (any prefix), then an identifier tail so SECRET_KEY, client_secret_key
    // and STRIPE_SECRET_KEY match; `auth` takes no tail so `author:` does not.
    // The value is quoted (spaces allowed, any length) or a bare run of 6+.
    re: /(?:(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credentials?)[A-Za-z0-9_-]{0,30}|auth(?![A-Za-z]))["']?\s{0,8}[:=]\s{0,8}(?:"([^"\r\n]{1,200})"|'([^'\r\n]{1,200})'|([^\s"']{6,}))/dgi,
    trim: /[,;)}\]]+$/,
    // A count is not a secret: `"input_tokens":12048` in a usage line.
    // Code-looking values (`token = session.id`) are exempt. Under a password-like key
    // only variable references and type names are: `password=correct.horse.battery`
    // is a passphrase, not a member chain.
    acceptBare: (v, match) =>
      !looksLikeCode(v, PASSWORD_LIKE_KEY.test(match)) &&
      !(TOKEN_COUNT_KEY.test(match) && /^\d+$/.test(v)),
  },
  {
    // A long high-entropy token right after a key-ish word: git SHAs, UUIDs
    // and base64 in prose have no such word in front of them and survive.
    id: 'high-entropy',
    re: /(?:key|token|secret|bearer|authorization)[\s:="'([]{1,20}([A-Za-z0-9+/=_-]{20,})/dgi,
    accept: (v) => shannonEntropy(v) >= ENTROPY_MIN,
  },
]

/** The match starts with a password-like key name (`DB_PASSWORD=`, `pwd:`), whose value is never treated as code. */
const PASSWORD_LIKE_KEY = /^[A-Za-z0-9_-]*(?:password|passwd|pwd|secret)/i

/** A key that counts tokens (`input_tokens`, `cache_read_tokens`), whose number is not a secret. */
const TOKEN_COUNT_KEY = /^[A-Za-z0-9_-]*tokens["']?\s*[:=]/i

/**
 * Object keys whose value is a secret (`auth` only exactly: `author` is not one). `pwd` is left
 * out: as a key it is usually a directory. `token` does not match the plural (`input_tokens`
 * counts) or `tokenizer`; a session id (`sessionId`) is an id, not a credential.
 */
const SECRET_KEY =
  /password|passwd|secret|token(?!s$|izer)|api[_-]?key|access[_-]?key|private[_-]?key|credential|cookie|authorization|^auth$/i

/** A key whose STRING value is a secret but whose object value is structure (`session: {id}`). */
const SECRET_STRING_KEY = /^session$/i

const PEM_BEGIN = /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----/g

const TYPE_WORDS =
  /^(?:string|number|boolean|any|unknown|null|undefined|true|false|none|str|int|bool)$/i

/**
 * The receivers a member chain may start with to read as code: `token = session.id`. A dotted
 * run of letters with any other first word (`api_key=abcdefgh.ijklmnop`) is a value, not a
 * reference.
 */
const CODE_RECEIVERS = new Set([
  'this',
  'self',
  'session',
  'env',
  'process',
  'config',
  'cfg',
  'opts',
  'options',
  'args',
  'params',
  'ctx',
  'context',
  'req',
  'request',
  'res',
  'response',
  'input',
  'state',
  'props',
  'user',
  'secrets',
])

/**
 * An unquoted value that is code, not a secret: a call, member chain off a known receiver
 * ({@link CODE_RECEIVERS}), type name or variable reference. `referencesOnly` (a password-like
 * key) keeps just the last two: a dotted word run under `password=` is a passphrase.
 */
function looksLikeCode(v: string, referencesOnly = false): boolean {
  if (v.startsWith('$') || v.startsWith('process.env.')) return true
  if (TYPE_WORDS.test(v)) return true
  if (referencesOnly) return false
  return (
    /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*\(/.test(v) ||
    (/^[A-Za-z_$][\w$]*(?:\.[\w$]+)+;?$/.test(v) &&
      !/\d/.test(v) &&
      CODE_RECEIVERS.has(v.slice(0, v.indexOf('.')).toLowerCase()))
  )
}

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>()
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let h = 0
  for (const n of freq.values()) {
    const p = n / s.length
    h -= p * Math.log2(p)
  }
  return h
}

function groupRanges(text: string, rule: GroupRule): RedactionRange[] {
  const out: RedactionRange[] = []
  for (const m of text.matchAll(rule.re)) {
    const indices = (m as RegExpMatchArray & { indices?: ([number, number] | undefined)[] }).indices
    if (!indices) continue
    let found = 0
    for (let g = 1; g < indices.length; g++) if (indices[g]) found = g
    const span = indices[found]
    if (found === 0 || !span) continue
    let [start, end] = span
    // Only an unquoted value (the last group) can carry trailing punctuation that is not its own.
    if (rule.trim && found === indices.length - 1) {
      const trimmed = text.slice(start, end).replace(rule.trim, '')
      end = start + trimmed.length
    }
    if (end <= start) continue
    if (
      rule.acceptBare &&
      found === indices.length - 1 &&
      !rule.acceptBare(text.slice(start, end), m[0])
    )
      continue
    if (rule.accept && !rule.accept(text.slice(start, end))) continue
    out.push([start, end, rule.id])
  }
  return out
}

/** PEM private keys by `indexOf` scan: linear, however many headers appear. */
function pemRanges(text: string): RedactionRange[] {
  const out: RedactionRange[] = []
  PEM_BEGIN.lastIndex = 0
  for (let m = PEM_BEGIN.exec(text); m; m = PEM_BEGIN.exec(text)) {
    const start = m.index
    const bodyStart = start + m[0].length
    let end = -1
    const endMark = text.indexOf('-----END ', bodyStart)
    if (endMark !== -1) {
      const close = text.indexOf('-----', endMark + '-----END '.length)
      if (close !== -1) end = close + '-----'.length
    }
    if (end === -1) end = Math.min(text.length, bodyStart + PEM_OPEN_CAP)
    out.push([start, end, 'private-key'])
    PEM_BEGIN.lastIndex = end
  }
  return out
}

function builtinRanges(text: string): RedactionRange[] {
  return [...pemRanges(text), ...GROUP_RULES.flatMap((r) => groupRanges(text, r))]
}

// ── environment values ──────────────────────────────────────────────────────

function isSecretEnvName(name: string): boolean {
  const upper = name.toUpperCase()
  if (ENV_DENY_NAMES.has(upper)) return false
  const parts = upper.split(/[_-]+/)
  if (ENV_DENY_TAILS.has(parts[parts.length - 1]!)) return false
  return parts.some((p) => ENV_SECRET_SEGMENTS.has(p)) || upper.includes('APIKEY')
}

/** Secret env values, longest first, paired with their `env:<NAME>` rule id. */
function secretEnvValues(
  env: Record<string, string | undefined>,
  extraNames: string[],
): [value: string, rule: string][] {
  const extra = new Set(extraNames)
  const out: [string, string][] = []
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.length < ENV_MIN_LENGTH) continue
    if (extra.has(name) || isSecretEnvName(name)) out.push([value, `env:${name}`])
  }
  return out.sort((a, b) => b[0].length - a[0].length)
}

function envRanges(text: string, values: [string, string][]): RedactionRange[] {
  const out: RedactionRange[] = []
  for (const [value, rule] of values) {
    for (let at = text.indexOf(value); at !== -1; at = text.indexOf(value, at + value.length)) {
      out.push([at, at + value.length, rule])
    }
  }
  return out
}

// ── merge and splice ────────────────────────────────────────────────────────

/** Merge overlapping or adjacent ranges; the earliest start keeps its rule. */
function mergeRanges(ranges: RedactionRange[]): RedactionRange[] {
  // Sorts in place: the caller's array is built fresh for each text.
  const sorted = ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: [number, number, string][] = []
  for (const [start, end, rule] of sorted) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end, rule])
  }
  return merged
}

function splice(
  text: string,
  merged: RedactionRange[],
): { text: string; redactions: Record<string, number> } {
  const redactions: Record<string, number> = {}
  const pieces: string[] = []
  let at = 0
  for (const [start, end, rule] of merged) {
    pieces.push(text.slice(at, start), `[REDACTED:${rule}]`)
    at = end
    count(redactions, rule)
  }
  pieces.push(text.slice(at))
  return { text: pieces.join(''), redactions }
}

/**
 * `key`, or `key#2`, `key#3`... when `out` already has it: two secrets used as keys redact to
 * the same `[REDACTED:<rule>]` and must not overwrite each other.
 */
function uniqueKey(out: object, key: string): string {
  if (!Object.hasOwn(out, key)) return key
  let n = 2
  while (Object.hasOwn(out, `${key}#${n}`)) n++
  return `${key}#${n}`
}

/** Add `n` replacements by `rule` to `into`. */
function count(into: Redactions, rule: string, n = 1): void {
  into[rule] = (into[rule] ?? 0) + n
}

/** Add the per-rule counts in `from` into `into`, for a caller that redacts several values into one line. */
export function mergeRedactions(into: Redactions, from: Readonly<Redactions>): void {
  for (const [rule, n] of Object.entries(from)) count(into, rule, n)
}

// ── factory ─────────────────────────────────────────────────────────────────

/**
 * Build a redactor. Secret-named environment values are read once, here.
 *
 * @throws An `Error` naming the pattern when an `extraPatterns` regex does not
 * compile or has a shape that risks catastrophic backtracking.
 */
export function createRedactor(opts: RedactorOptions = {}): Redactor {
  const envValues = secretEnvValues(opts.env ?? process.env, opts.envNames ?? [])
  const lint = opts.lint ?? secretlintRanges
  const custom = (opts.extraPatterns ?? []).map(({ id, regex }) => {
    const problem = redactPatternProblem(regex)
    if (problem !== null) throw new Error(`invalid redaction pattern '${id}': ${problem}`)
    return { rule: `custom:${id}`, re: new RegExp(regex, 'g') }
  })

  async function redact(text: string) {
    try {
      const ranges: RedactionRange[] = [
        ...(await lint(text)),
        ...builtinRanges(text),
        ...envRanges(text, envValues),
      ]
      // A custom pattern runs unbounded: V8 has no backtracking step limit, so a bad match
      // blocks until it ends. Only the check in createRedactor guards it.
      for (const { rule, re } of custom) {
        for (const m of text.matchAll(re)) {
          if (m[0].length > 0) ranges.push([m.index, m.index + m[0].length, rule])
        }
      }
      // Most lines hold no secret: skip the merge and the splice.
      if (ranges.length === 0) return { text: text as Redacted, redactions: {} }
      const { text: out, redactions } = splice(text, mergeRanges(ranges))
      return { text: out as Redacted, redactions }
    } catch {
      return { text: FAILED_CLOSED as Redacted, redactions: { 'redactor-error': 1 } }
    }
  }

  async function redactJson(value: unknown) {
    const redactions: Record<string, number> = {}
    const ancestors = new WeakSet<object>()
    async function str(v: string): Promise<string> {
      const r = await redact(v)
      mergeRedactions(redactions, r.redactions)
      return r.text
    }
    async function walk(v: unknown, depth: number): Promise<unknown> {
      if (typeof v === 'string') return str(v)
      // JSON.stringify throws on a BigInt; a function (an own `toJSON` included) would run at
      // write time and emit what it returns, unredacted. Symbols are dropped as JSON drops them.
      if (typeof v === 'bigint') return v.toString()
      if (typeof v === 'function' || typeof v === 'symbol') return undefined
      if (v === null || typeof v !== 'object') return v
      if (depth >= MAX_JSON_DEPTH) return '[MaxDepth]'
      if (ancestors.has(v)) return '[Circular]'
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString()
      ancestors.add(v)
      try {
        if (v instanceof Error) {
          return {
            name: await str(v.name),
            message: await str(v.message),
            ...(v.stack === undefined ? {} : { stack: await str(v.stack) }),
          }
        }
        if (Array.isArray(v) || v instanceof Set) {
          const out: unknown[] = []
          // An array slot keeps its place: a dropped function becomes null, as in JSON.
          for (const item of v) out.push((await walk(item, depth + 1)) ?? null)
          return out
        }
        const entries: [string, unknown][] =
          v instanceof Map ? [...v].map(([k, item]) => [String(k), item]) : Object.entries(v)
        const out: Record<string, unknown> = {}
        for (const [k, item] of entries) {
          if (typeof item === 'function' || typeof item === 'symbol' || item === undefined) continue
          const key = uniqueKey(out, await str(k))
          // A secret-named key carries its value's context, which a per-string
          // pass cannot see: `{ "password": "hunter22" }`. Numbers and booleans
          // are kept (`max_tokens: 100`).
          const blank =
            (SECRET_KEY.test(k) &&
              ((typeof item === 'string' && item.length > 0) ||
                (item !== null && typeof item === 'object'))) ||
            (SECRET_STRING_KEY.test(k) && typeof item === 'string' && item.length > 0)
          if (blank) count(redactions, 'assigned-secret')
          const value = blank ? '[REDACTED:assigned-secret]' : await walk(item, depth + 1)
          // defineProperty: a plain `out['__proto__'] = ...` would set the prototype, not a key.
          Object.defineProperty(out, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true,
          })
        }
        return out
      } finally {
        ancestors.delete(v)
      }
    }
    try {
      return { value: await walk(value, 0), redactions }
    } catch {
      return {
        value: FAILED_CLOSED,
        redactions: { ...redactions, 'redactor-error': 1 },
      }
    }
  }

  return { redact, redactJson }
}
