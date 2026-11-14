/** An object without the keys that may hold `undefined` as required keys: each becomes optional. */
export type Given<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} & { [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined> }

/** Drop the keys with no value, so an absent flag or parameter is an absent key. */
export function given<T extends object>(o: T): Given<T> {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k]
  return o as Given<T>
}
