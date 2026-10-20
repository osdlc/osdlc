/**
 * Secret redaction, shared by every reader that returns MCP servers.
 *
 * MCP `env` and header values, and the user part and query values of a URL,
 * read {@link REDACTED} unless a caller asks for the values. Credential files
 * are never read for their values; see the providers.
 *
 * Runtime-agnostic: pure.
 */

import { asObject } from '../json.ts'

/** The text that replaces a secret value. */
export const REDACTED = '<redacted>'

/**
 * Redact the secret parts of a URL: the whole user part (`user:password@` or a
 * token used as the username, `token@`), and the value of every query
 * parameter. Works on the text, so a URL with a `${VAR}` template (which
 * `new URL` rejects) is covered too.
 */
export function redactUrl(url: string): string {
  return url
    .replace(/(\/\/)[^/@\s?#]+@/, `$1${REDACTED}@`)
    .replace(/([?&][^=&#\s]+=)[^&#\s]*/g, `$1${REDACTED}`)
}

/** The string entries of an object, each value replaced with {@link REDACTED} when `redact` is set. */
export function stringRecord(value: unknown, redact: boolean): Record<string, string> {
  const obj = asObject(value)
  if (!obj) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = redact ? REDACTED : v
  }
  return out
}

/** A flag whose value is a secret: `--` and a name that contains one of these words. */
const SECRET_FLAG = /^--[^=\s]*(token|secret|key|password|auth)/i

/** An HTTP credential header written as one argument, such as `Authorization: Bearer x`. */
const AUTH_HEADER = /^(.*?\bauthorization\s*:\s*).+$/i

/** A bearer credential written as one argument, such as `Bearer x`. */
const BEARER = /^(bearer\s+).+$/i

/** A `KEY=value` argument whose key names a secret. */
const SECRET_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=/
const SECRET_KEY_NAME = /token|secret|key|password/i

/**
 * Redact the arguments of an MCP command that look like secrets:
 *   - a URL (`scheme://…`) through {@link redactUrl};
 *   - the value of a `--flag` whose name contains `token`, `secret`, `key`,
 *     `password` or `auth` (ignoring case), in both the `--flag value` and
 *     `--flag=value` forms. A next argument that starts with `--` is another
 *     flag, not the value, and is kept;
 *   - the value of a `KEY=value` argument whose `KEY` contains `token`,
 *     `secret`, `key` or `password`, ignoring case;
 *   - the value of an `Authorization:` header argument, and the token of a
 *     `Bearer <token>` argument.
 * Every other argument is returned as written.
 */
export function redactArgs(args: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    const eq = arg.indexOf('=')
    const flag = eq < 0 ? arg : arg.slice(0, eq)
    if (SECRET_FLAG.test(flag)) {
      if (eq >= 0) out.push(`${arg.slice(0, eq)}=${REDACTED}`)
      else {
        out.push(arg)
        if (i + 1 < args.length && !args[i + 1]!.startsWith('--')) {
          out.push(REDACTED)
          i++
        }
      }
      continue
    }
    const assignment = SECRET_ASSIGNMENT.exec(arg)
    if (assignment && SECRET_KEY_NAME.test(assignment[1]!)) {
      out.push(`${assignment[1]}=${REDACTED}`)
      continue
    }
    const header = AUTH_HEADER.exec(arg) ?? BEARER.exec(arg)
    if (header) {
      out.push(`${header[1]}${REDACTED}`)
      continue
    }
    out.push(arg.includes('://') ? redactUrl(arg) : arg)
  }
  return out
}
