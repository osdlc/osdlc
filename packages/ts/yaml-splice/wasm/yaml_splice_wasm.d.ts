/* tslint:disable */
/* eslint-disable */

/**
 * The successful outcome of an edit batch. A wasm-bindgen class: the caller
 * reads `.bytes` / `.changed` and should `.free()` it when done (it owns a
 * slot in wasm linear memory). The TS façade reads both into a plain object
 * and frees this handle, so callers never see the class.
 */
export class EditResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The complete output bytes. On a semantic no-op these are byte-identical
     * to the input.
     */
    readonly bytes: Uint8Array;
    /**
     * Whether any edit changed a byte.
     */
    readonly changed: boolean;
}

/**
 * Edit `source` (raw UTF-8 YAML bytes) with `edits_json`, an array of
 * externally-tagged field edits, e.g.
 * `[{"Set":{"key":"status","value":"done"}}]`,
 * `[{"Remove":{"key":"draft"}}]`, `[{"Rename":{"from":"a","to":"b"}}]`.
 */
export function editYaml(source: Uint8Array, edits_json: string): EditResult;
