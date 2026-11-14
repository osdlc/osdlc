import { z } from 'zod'
import { MAX_SIZE, readSize } from './context.ts'
import { deepFreeze } from './freeze.ts'
import { protoSafeRecord } from './record.ts'
import { parseRef, type Ref, type RefParseError } from './ref.ts'
import { err, ok, type Result } from '@osdlc/result'

const RefList = z.array(z.string()).min(1)

/**
 * A bare list or the long form. A failure reports the branch the input's
 * shape picks (a list, else the long form), so an unknown key is named
 * (`Unrecognized key: "headless"`) rather than `Invalid input`.
 */
export const ProfileConfigSchema = z.union(
  [
    RefList,
    z.strictObject({
      order: RefList,
      host: z.string().optional(),
      /** The least context every entry must reach: `digits` plus `k` or `m`. */
      context: z.string().optional(),
    }),
  ],
  {
    error: (iss) => {
      if (iss.code !== 'invalid_union' || typeof iss.input !== 'object' || iss.input === null) {
        return undefined
      }
      const branch = iss.errors[Array.isArray(iss.input) ? 0 : 1] ?? []
      return branch
        .map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message))
        .join('; ')
    },
  },
)

/** A profile as config writes it: a list of reference strings, or `{order, host?, context?}`. */
export type ProfileConfig = z.infer<typeof ProfileConfigSchema>

/**
 * Schema for a `profiles:` section: profile names mapped to {@link ProfileConfigSchema} values. A
 * `__proto__` name is refused.
 */
export const ProfilesConfigSchema = protoSafeRecord(z.string(), ProfileConfigSchema)

/**
 * The profiles that exist without config, as aider's and opencode's `model`
 * and `small_model`: `default`, the `standard` category chain across every
 * tool, and `small`, the `fast` one. A project's `profiles:` entry of the same
 * name replaces one whole.
 */
export const BUILTIN_PROFILES: Readonly<Record<string, readonly string[]>> = deepFreeze({
  default: ['*/standard'],
  small: ['*/fast'],
})

/**
 * A parsed profile: the references to try in `order`, an optional `host`, and an optional minimum
 * `context` in tokens.
 */
export type Profile = {
  order: Ref[]
  host?: string
  /** `context:` in tokens: an entry whose model cannot reach it is skipped. */
  context?: number
}

/**
 * Why a profile did not parse: the wrong shape, a reference that did not parse (`index` of the
 * entry), or a bad `context` size.
 */
export type ProfileError =
  | { kind: 'invalid-shape'; message: string }
  | { kind: 'invalid-ref'; index: number; error: RefParseError; message: string }
  | { kind: 'invalid-context'; message: string }

function issues(error: z.ZodError): string {
  return error.issues
    .map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ')
}

function isList(config: ProfileConfig | readonly string[]): config is readonly string[] {
  return Array.isArray(config)
}

function normalize(config: ProfileConfig | readonly string[]): Result<Profile, ProfileError> {
  const long = isList(config) ? { order: config } : config
  const extra = isList(config) ? undefined : config
  const order: Ref[] = []
  for (const [index, text] of long.order.entries()) {
    const parsed = parseRef(text)
    if (!parsed.ok) {
      return err({
        kind: 'invalid-ref',
        index,
        error: parsed.error,
        message: `order[${index}]: ${parsed.error.message}`,
      })
    }
    order.push(parsed.value)
  }
  const profile: Profile = { order }
  if (extra?.host !== undefined) profile.host = extra.host
  if (extra?.context !== undefined) {
    const size = readSize(extra.context)
    if (!size.ok) {
      return err({
        kind: 'invalid-context',
        message:
          size.error === 'too-large'
            ? `context: '${extra.context}' is above the largest size, ${MAX_SIZE} tokens`
            : `context: must be digits plus k or m (1m, 200k); got '${extra.context}'`,
      })
    }
    profile.context = size.value
  }
  return ok(profile)
}

/**
 * Parse one profile from its config form, a list of references or `{order, host?, context?}`.
 * Returns an error for the wrong shape, a reference that does not parse (with the entry's index)
 * or a `context` that is not digits plus `k` or `m`, or is above {@link MAX_SIZE}. Whether the
 * references exist in a catalogue is {@link validateProfile}'s check.
 */
export function parseProfile(input: unknown): Result<Profile, ProfileError> {
  const parsed = ProfileConfigSchema.safeParse(input)
  if (!parsed.success) return err({ kind: 'invalid-shape', message: issues(parsed.error) })
  return normalize(parsed.data)
}

/**
 * Parse a `profiles:` section over {@link BUILTIN_PROFILES}: the result holds
 * the built-in profiles a section does not redefine, and every profile it
 * defines.
 */
export function parseProfiles(input: unknown): Result<Record<string, Profile>, ProfileError> {
  const parsed = ProfilesConfigSchema.safeParse(input)
  if (!parsed.success) return err({ kind: 'invalid-shape', message: issues(parsed.error) })
  const out: Record<string, Profile> = {}
  for (const [name, config] of Object.entries({ ...BUILTIN_PROFILES, ...parsed.data })) {
    const profile = normalize(config)
    if (!profile.ok) {
      return err({ ...profile.error, message: `profile '${name}': ${profile.error.message}` })
    }
    out[name] = profile.value
  }
  return ok(out)
}
