import { chooseFromProfile, refProfile, type Choice, type ChooseContext } from './choose.ts'
import { parseProfile, type Profile, type ProfileError } from './profile.ts'
import { parseRef, type RefParseError } from './ref.ts'
import { err, ok, type Result } from '@osdlc/result'

/**
 * A task/step binding: exactly one of a profile or a single reference
 * (`tool`). `profile` names an entry of `profiles`, or is an inline list of
 * references walked as an unnamed profile. A `tool` reference walks as a
 * one-entry profile, so a wildcard (`*` with a tier) expands through the chain
 * order, as it does in a profile.
 */
export type Binding = { profile?: string | readonly string[]; tool?: string }

/**
 * Why a binding could not be walked: `binding-invalid` (both or neither of `profile` and `tool`),
 * `unknown-profile`, `invalid-profile` or `invalid-ref`.
 */
export type BindingError =
  | { kind: 'binding-invalid'; message: string }
  | { kind: 'unknown-profile'; name: string; known: string[]; message: string }
  | { kind: 'invalid-profile'; error: ProfileError; message: string }
  | { kind: 'invalid-ref'; error: RefParseError; message: string }

/**
 * Walk a {@link Binding}: a named profile from `profiles`, an inline list of references (an
 * unnamed profile), or a single `tool` reference (a one-entry profile). Returns a {@link
 * BindingError} when the binding sets both or neither, names an unknown profile, or holds a
 * reference or profile that does not parse; otherwise the {@link Choice} of {@link
 * chooseFromProfile}. A binding that is not an object, or whose `tool` is not a string, is
 * `binding-invalid`: config read from YAML can hold anything, so nothing here throws on a wrong
 * shape.
 */
export function resolveBinding(
  binding: Binding,
  profiles: Record<string, Profile>,
  ctx: ChooseContext,
): Result<Choice, BindingError> {
  if (typeof binding !== 'object' || binding === null || Array.isArray(binding)) {
    return err({ kind: 'binding-invalid', message: 'a binding must be an object' })
  }
  const hasProfile = binding.profile !== undefined
  const hasTool = binding.tool !== undefined
  if (hasProfile === hasTool) {
    return err({
      kind: 'binding-invalid',
      message: hasProfile
        ? "binding sets both 'profile' and 'tool'; set exactly one"
        : "binding sets neither 'profile' nor 'tool'; set exactly one",
    })
  }

  if (typeof binding.profile === 'string') {
    const profile = Object.hasOwn(profiles, binding.profile) ? profiles[binding.profile] : undefined
    if (profile === undefined) {
      const known = Object.keys(profiles).sort()
      return err({
        kind: 'unknown-profile',
        name: binding.profile,
        known,
        message: `unknown profile '${binding.profile}'; known: ${known.length > 0 ? known.join(', ') : '(none)'}`,
      })
    }
    return ok(chooseFromProfile(profile, ctx))
  }

  if (binding.profile !== undefined) {
    // parseProfile also takes the long form `{order: [...]}` and reads null as
    // a shape error of its own; a binding's profile is a name or a list only.
    if (!Array.isArray(binding.profile)) {
      const message = 'expected a profile name or a list of references'
      return err({
        kind: 'invalid-profile',
        error: { kind: 'invalid-shape', message },
        message: `binding profile: ${message}`,
      })
    }
    const inline = parseProfile(binding.profile)
    if (!inline.ok) {
      return err({
        kind: 'invalid-profile',
        error: inline.error,
        message: `binding profile: ${inline.error.message}`,
      })
    }
    return ok(chooseFromProfile(inline.value, ctx))
  }

  if (typeof binding.tool !== 'string') {
    return err({
      kind: 'binding-invalid',
      message: 'binding tool: expected a reference string',
    })
  }
  const parsed = parseRef(binding.tool)
  if (!parsed.ok) {
    return err({
      kind: 'invalid-ref',
      error: parsed.error,
      message: `binding tool: ${parsed.error.message}`,
    })
  }
  return ok(chooseFromProfile(refProfile(parsed.value), ctx))
}
