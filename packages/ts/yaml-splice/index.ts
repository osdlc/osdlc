/**
 * Edit top-level fields of a YAML mapping in place, on bytes: set, remove or
 * rename a field, and every byte outside the edited span stays as it was.
 *
 * The editor is the `yaml-splice` Rust crate, built to WebAssembly. This file
 * is a typed wrapper over the generated glue in `./wasm`, and it is the only
 * thing callers import. It passes the edits across as JSON, copies the result
 * into a plain `EditOutcome`, and frees the wasm-side handle, so no handle
 * that points into wasm memory reaches a caller. A refused edit is thrown as
 * an {@link EditError}.
 *
 * The behaviour is the crate's, byte for byte: an edit that changes no value
 * returns the input bytes, and every byte outside an edited span is kept.
 */
import {
  editYaml as editYamlWasm,
  type EditResult as WasmEditResult,
} from './wasm/yaml_splice_wasm.js'

/**
 * A JSON-shaped value a `Set` edit may write: the same shape a JavaScript value
 * can take, matching the crate's `From<&serde_json::Value>` bridge. Object key
 * order for NESTED maps is not load-bearing (see the crate's ordering caveat);
 * the TOP-LEVEL key being edited is addressed by `key`, never rebuilt.
 */
export type EditValue =
  null | boolean | number | string | readonly EditValue[] | { readonly [key: string]: EditValue }

/**
 * One top-level field edit, externally tagged to match the crate's `FieldEdit`
 * enum: exactly one of `Set`, `Remove` or `Rename`. A `Remove` of a key that is
 * not there changes nothing.
 */
export type FieldEdit =
  | { readonly Set: { readonly key: string; readonly value: EditValue } }
  | { readonly Remove: { readonly key: string } }
  | { readonly Rename: { readonly from: string; readonly to: string } }

/**
 * The result of an edit batch. A plain object — the bindgen handle has
 * already been freed by the time you hold this.
 */
export interface EditOutcome {
  /** The complete output bytes. On a semantic no-op, byte-identical to input. */
  readonly bytes: Uint8Array
  /** Whether any edit changed a byte. `false` means `bytes` equals the input. */
  readonly changed: boolean
}

/**
 * Why an edit was refused: one code per variant of the crate's `EditError`.
 * A minor release may add a code, so a `switch` over it needs a `default`
 * branch.
 */
export type EditErrorCode =
  | 'InvalidUtf8'
  | 'MalformedYaml'
  | 'UnsupportedDocument'
  | 'RootNotMapping'
  | 'AmbiguousKey'
  | 'MissingKey'
  | 'KeyConflict'
  | 'UnrenderableValue'
  | 'InvalidResult'

/**
 * A byte span `[start, end)` into the input. `RootNotMapping`, `AmbiguousKey`
 * and `KeyConflict` always carry one; `MalformedYaml` and `UnsupportedDocument`
 * carry one when the parser knows the location.
 */
export interface EditSpan {
  readonly start: number
  readonly end: number
}

/**
 * A typed, structured refusal from the Rust core. `name`/`code` is the variant
 * and `span` carries the byte range where one is known. Thrown by
 * {@link editYaml} in place of the raw bindgen error.
 */
export class EditError extends Error {
  /** The refusal variant, mirrored onto `name` so `err.name` is the code. */
  readonly code: EditErrorCode
  /** Where the refusal happened, when the variant carries a location. */
  readonly span?: EditSpan

  constructor(code: EditErrorCode, message: string, span?: EditSpan) {
    super(message)
    this.name = code
    this.code = code
    // Assign only when present so `span` stays a truly-optional property under a
    // consumer's `exactOptionalPropertyTypes` (an absent property still reads as
    // `undefined`; assigning `undefined` outright would violate that flag).
    if (span !== undefined) this.span = span
  }
}

const ERROR_CODES: ReadonlySet<string> = new Set<EditErrorCode>([
  'InvalidUtf8',
  'MalformedYaml',
  'UnsupportedDocument',
  'RootNotMapping',
  'AmbiguousKey',
  'MissingKey',
  'KeyConflict',
  'UnrenderableValue',
  'InvalidResult',
])

/**
 * Edit `source` (raw UTF-8 YAML bytes) with an ordered batch of `edits`,
 * returning new bytes plus a `changed` flag, or throwing a typed
 * {@link EditError}. Byte-identical to `yaml_splice::edit_yaml`.
 *
 * The edits apply in order, and each sees the result of the ones before it.
 * The batch is atomic: if any edit is refused, nothing is returned and no
 * partial edit is observable. A non-finite number (`NaN`, `±Infinity`) anywhere
 * in a `Set` value is refused as `UnrenderableValue`.
 *
 * Keys match case-insensitively: `Title` and `title` are the same key. Both
 * sides are lowercased and nothing else is normalized. Two existing keys that
 * differ only in case make an edit of either one `AmbiguousKey`.
 */
export function editYaml(source: Uint8Array, edits: readonly FieldEdit[]): EditOutcome {
  assertFiniteNumbers(edits)
  const editsJson = JSON.stringify(edits)

  let result: WasmEditResult
  try {
    result = editYamlWasm(source, editsJson)
  } catch (raw) {
    throw toEditError(raw)
  }

  // Read both fields into a plain object, THEN free the handle. The glue's
  // `bytes` getter returns an owned copy (`.slice()`), so it survives `free()`.
  try {
    return { bytes: result.bytes, changed: result.changed }
  } finally {
    result.free()
  }
}

/**
 * Refuse non-finite numbers before the JSON boundary. `JSON.stringify` renders
 * `NaN` and `±Infinity` as `null`, so without this guard a `Set` would silently
 * write `null` over the field instead of refusing the value.
 */
function assertFiniteNumbers(edits: readonly FieldEdit[]): void {
  for (const edit of edits) {
    if ('Set' in edit) assertFiniteValue(edit.Set.value, edit.Set.key)
  }
}

function assertFiniteValue(value: EditValue, key: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new EditError(
        'UnrenderableValue',
        `key '${key}': ${value} is not a finite number and has no YAML rendering`,
      )
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) assertFiniteValue(item, key)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertFiniteValue(item, key)
  }
}

/** Map a thrown bindgen `Error` (`.name` = variant, `.span`) to `EditError`. */
function toEditError(raw: unknown): EditError {
  if (raw instanceof Error) {
    const code: EditErrorCode = ERROR_CODES.has(raw.name)
      ? (raw.name as EditErrorCode)
      : 'InvalidResult'
    const span = readSpan((raw as { span?: unknown }).span)
    return new EditError(code, raw.message, span)
  }
  return new EditError('InvalidResult', String(raw))
}

function readSpan(span: unknown): EditSpan | undefined {
  if (
    span !== null &&
    typeof span === 'object' &&
    typeof (span as EditSpan).start === 'number' &&
    typeof (span as EditSpan).end === 'number'
  ) {
    const { start, end } = span as EditSpan
    return { start, end }
  }
  return undefined
}
