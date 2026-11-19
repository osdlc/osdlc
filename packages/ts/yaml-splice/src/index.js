/**
 * Edit top-level fields of a YAML mapping in place, on bytes: set, remove or
 * rename a field, and every byte outside the edited span stays as it was.
 *
 * The editor is the `yaml-splice` Rust crate, built to WebAssembly. This file
 * is a typed wrapper over the generated glue in `wasm/` (imported as `#wasm`,
 * which package.json maps to the copy in dist/), and it is the only thing
 * callers import. It passes the edits across as JSON, copies the result
 * into a plain `EditOutcome`, and frees the wasm-side handle, so no handle
 * that points into wasm memory reaches a caller. A refused edit is thrown as
 * an {@link EditError}.
 *
 * The behaviour is the crate's, byte for byte: an edit that changes no value
 * returns the input bytes, and every byte outside an edited span is kept.
 */
import { editYaml as editYamlWasm } from '#wasm';
/**
 * A typed refusal of an edit batch. `name`/`code` is the variant
 * and `span` carries the byte range where one is known. Thrown by
 * {@link editYaml} in place of the raw bindgen error.
 */
export class EditError extends Error {
    /** The refusal variant, mirrored onto `name` so `err.name` is the code. */
    code;
    constructor(code, message, span) {
        super(message);
        this.name = code;
        this.code = code;
        // Assign only when present, so `span` stays an optional property under a
        // consumer's `exactOptionalPropertyTypes`. Assigning `undefined` would break
        // that flag.
        if (span !== undefined)
            this.span = span;
    }
}
// Every code, so the type check fails when a code is missing here.
const ERROR_CODE_TABLE = {
    InvalidEdit: true,
    InvalidUtf8: true,
    MalformedYaml: true,
    UnsupportedDocument: true,
    RootNotMapping: true,
    AmbiguousKey: true,
    MissingKey: true,
    KeyConflict: true,
    UnrenderableValue: true,
    InvalidResult: true,
};
const ERROR_CODES = new Set(Object.keys(ERROR_CODE_TABLE));
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
export function editYaml(source, edits) {
    assertFiniteNumbers(edits);
    const editsJson = JSON.stringify(edits);
    let result;
    try {
        result = editYamlWasm(source, editsJson);
    }
    catch (raw) {
        throw isRefusal(raw) ? toEditError(raw) : raw;
    }
    // Read both fields into a plain object, then free the handle. The glue's
    // `bytes` getter returns an owned copy (`.slice()`), so it survives `free()`.
    try {
        return { bytes: result.bytes, changed: result.changed };
    }
    finally {
        result.free();
    }
}
/**
 * Refuse non-finite numbers before the JSON boundary. `JSON.stringify` renders
 * `NaN` and `±Infinity` as `null`, so without this check a `Set` would silently
 * write `null` over the field instead of refusing the value.
 */
function assertFiniteNumbers(edits) {
    for (const edit of edits) {
        if ('Set' in edit)
            assertFiniteValue(edit.Set.value, edit.Set.key);
    }
}
function assertFiniteValue(value, key) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new EditError('UnrenderableValue', `key '${key}': ${value} is not a finite number and has no YAML rendering`);
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            assertFiniteValue(item, key);
        return;
    }
    if (value !== null && typeof value === 'object') {
        for (const item of Object.values(value))
            assertFiniteValue(item, key);
    }
}
/**
 * The `.name` the wasm gives a crate `EditError` variant it has no name for
 * (the crate's enum is `#[non_exhaustive]`). It is still a refusal, reported as
 * `InvalidResult`.
 */
const UNNAMED_REFUSAL = 'EditError';
/**
 * Whether a thrown value is one of the wasm side's refusals: an `Error` whose
 * `name` is a known code, or {@link UNNAMED_REFUSAL}. Anything else, such as a
 * Rust panic (`RuntimeError: unreachable`), is rethrown as is: it means the
 * module is broken, not that the edit was refused.
 */
function isRefusal(raw) {
    return raw instanceof Error && (ERROR_CODES.has(raw.name) || raw.name === UNNAMED_REFUSAL);
}
/** Map a bindgen refusal (`.name` = code, `.span`) to `EditError`. */
function toEditError(raw) {
    const code = ERROR_CODES.has(raw.name) ? raw.name : 'InvalidResult';
    return new EditError(code, raw.message, readSpan(raw.span));
}
function readSpan(span) {
    if (span !== null &&
        typeof span === 'object' &&
        typeof span.start === 'number' &&
        typeof span.end === 'number') {
        const { start, end } = span;
        return { start, end };
    }
    return undefined;
}
