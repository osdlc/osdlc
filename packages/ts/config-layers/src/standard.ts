/**
 * Validation through any Standard Schema validator (https://standardschema.dev):
 * zod 4, valibot, arktype and others. The machine file ({@link machineConfigFile})
 * reads and salvages through this module, so it takes any of them.
 *
 * The spec asks libraries to copy its types rather than depend on them, so
 * {@link StandardSchemaV1} is the spec's own interface, trimmed to what a read needs.
 * What reads a schema's shape (keys, descriptions, defaults, `.meta()`) stays
 * zod-only; a Standard Schema validator exposes none of that.
 */

/**
 * The Standard Schema V1 interface (spec version 1).
 *
 * @experimental
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}

/**
 * @experimental
 */
export declare namespace StandardSchemaV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>
    readonly types?: Types<Input, Output> | undefined
  }
  type Result<Output> = SuccessResult<Output> | FailureResult
  interface SuccessResult<Output> {
    readonly value: Output
    readonly issues?: undefined
  }
  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>
  }
  interface Issue {
    readonly message: string
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined
  }
  interface PathSegment {
    readonly key: PropertyKey
  }
  interface Types<Input = unknown, Output = Input> {
    readonly input: Input
    readonly output: Output
  }
  type InferOutput<S extends StandardSchemaV1> = NonNullable<S['~standard']['types']>['output']
}

/**
 * One problem a validator reported: the key path and the message.
 *
 * @experimental
 */
export interface StandardIssue {
  path: string[]
  message: string
}

/**
 * The result of {@link validateStandard}.
 *
 * @experimental
 */
export type StandardValidation<T> = { ok: true; value: T } | { ok: false; issues: StandardIssue[] }

/**
 * Validate `value` with `schema` and map its issues to string paths. Throws a
 * `TypeError` when the validator is asynchronous, since a config load is
 * synchronous.
 *
 * @experimental
 */
export function validateStandard<S extends StandardSchemaV1>(
  schema: S,
  value: unknown,
): StandardValidation<StandardSchemaV1.InferOutput<S>> {
  const outcome = schema['~standard'].validate(value)
  if (typeof (outcome as { then?: unknown }).then === 'function') {
    // Settle the promise so a rejection is not left unhandled.
    Promise.resolve(outcome).catch(() => undefined)
    throw new TypeError(
      `a config schema must validate synchronously; ${schema['~standard'].vendor} returned a promise`,
    )
  }
  const result = outcome as StandardSchemaV1.Result<unknown>
  if (result.issues === undefined) {
    return { ok: true, value: result.value as StandardSchemaV1.InferOutput<S> }
  }
  return {
    ok: false,
    issues: result.issues.map((issue) => ({
      path: (issue.path ?? []).map((seg) => String(typeof seg === 'object' ? seg.key : seg)),
      message: issue.message,
    })),
  }
}

/** Whether `schema` is a zod 4 schema (it has `_zod`), the only kind whose shape the library can read. */
export function isZodSchema(schema: unknown): boolean {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '_zod' in schema &&
    typeof (schema as { safeParse?: unknown }).safeParse === 'function' &&
    (schema as unknown as StandardSchemaV1)['~standard']?.vendor === 'zod'
  )
}
