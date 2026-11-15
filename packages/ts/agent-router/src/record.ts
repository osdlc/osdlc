import { z } from 'zod'

/**
 * `schema`, refusing an input object that has an own `__proto__` key (one
 * `JSON.parse` or a YAML load makes). Zod's records skip that key without an
 * issue, so a `profiles:` or `router.tools` entry named `__proto__` would
 * vanish; the config sections are strict, so it is an error here instead.
 */
function refuseProtoKey<T extends z.ZodType>(schema: T) {
  return z.preprocess((input, ctx) => {
    if (typeof input === 'object' && input !== null && Object.hasOwn(input, '__proto__')) {
      ctx.addIssue({ code: 'custom', path: ['__proto__'], message: "'__proto__' cannot be a key" })
    }
    return input
  }, schema)
}

/**
 * `z.record(key, value)` that refuses a `__proto__` key ({@link refuseProtoKey}). Every record a
 * config or catalogue reads is built with it.
 */
export function protoSafeRecord<K extends z.core.$ZodRecordKey, V extends z.ZodType>(
  key: K,
  value: V,
) {
  return refuseProtoKey(z.record(key, value))
}
