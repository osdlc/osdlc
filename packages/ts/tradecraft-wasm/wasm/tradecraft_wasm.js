/* @ts-self-types="./tradecraft_wasm.d.ts" */

/**
 * Import published `SKILL.md` bundles into the vault as notes — or, under
 * `mode: "dry-run"`, report what that would have done and write nothing.
 *
 * `vfs` is the host's filesystem object; `request_json` is a serialized
 * `AdoptRequest` optionally carrying a `namespace` stem (see
 * `WireAdoptRequest`). Returns a serialized `AdoptReport`.
 *
 * # The preview is the core's mode, and a caller may not predict it
 *
 * `mode` is `"write"`, or `"dry-run"` to plan the whole adoption and stop.
 * Absent means `"write"`. The core runs the identical path in both, over a
 * capturing overlay — same names, same collision refusals, same per-skill
 * `refused` where a vault note already exists — so the preview is the report
 * the write would have produced.
 *
 * A host computing its own preview would be a second implementation of
 * adoption's naming and refusal rules, wrong the first time the core's moved.
 *
 * # Errors
 *
 * Everything the core refuses before a byte is written, thrown: `RootNotFound`
 * for a missing source, and `Refused` for the rail (a skills root that is,
 * contains, or sits inside the source), `unknown-target`, `unsafe-path`,
 * `path-collision`; `SkillNotFound` where a requested skill matched nothing.
 *
 * An adoption target that already exists is NOT one of these. It is
 * `status: "refused"` on that skill's report line, with the others proceeding
 * — the same rail-inside-the-report shape `publishSkill` documents.
 * @param {any} vfs
 * @param {string} request_json
 * @returns {string}
 */
function adoptSkills(vfs, request_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(request_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.adoptSkills(retptr, addHeapObject(vfs), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr2 = r0;
        var len2 = r1;
        if (r3) {
            ptr2 = 0; len2 = 0;
            throw takeObject(r2);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
    }
}
exports.adoptSkills = adoptSkills;

/**
 * The one destination a target name folds onto, or `undefined` for a name
 * outside [`KNOWN_TARGETS`] — `tradecraft_core::publish::canonical_target`,
 * verbatim.
 *
 * Exported because the fold is not derivable from [`known_targets`] alone:
 * that list carries both spellings of a destination (`claude` and
 * `claude-code`) and says nothing about which pairs name the same place. A
 * host narrowing a run by `--target claude` against a destination configured
 * `claude-code` has to ask the core, or keep a second copy of the table and
 * drift from it.
 *
 * # Why this one does not cross as JSON
 *
 * Every export above hands back a serialized core structure, because that is
 * the only way a struct crosses. This answers with one name out of a
 * compile-time vocabulary — there is no structure, and no error either, so
 * there is nothing for a `Result<String, JsValue>` to carry. Wrapping it
 * would add a `JSON.parse` to a value that is already a string.
 * @param {string} name
 * @returns {string | undefined}
 */
function canonicalTarget(name) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.canonicalTarget(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        let v2;
        if (r0 !== 0) {
            v2 = getStringFromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
        }
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}
exports.canonicalTarget = canonicalTarget;

/**
 * Every component under a vault's skills root, vetted and sorted, and every
 * note the scan could not read.
 *
 * `vfs` is the host's filesystem object; `request_json` is a
 * `WireDiscoverRequest`. Returns a serialized
 * `tradecraft_core::DiscoveryReport` — the core's own return value, an
 * object with `components` and `skipped`. Both halves cross: a host that saw
 * only the roster could not tell a vault with three skills from a vault with
 * three skills and a note nobody can read.
 *
 * Every other verb here is vault-wide because of this scan.
 *
 * # Errors
 *
 * Only what is not a fact about one note: a missing skills root
 * (`RootNotFound`), a symlink in the tree, a duplicate name, and a bundle
 * containing another component's entry. Everything wrong with a single note
 * is reported in `skipped` and does not throw — one half-written draft must
 * not block every publish out of a shared vault.
 * @param {any} vfs
 * @param {string} request_json
 * @returns {string}
 */
function discoverComponents(vfs, request_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(request_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.discoverComponents(retptr, addHeapObject(vfs), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr2 = r0;
        var len2 = r1;
        if (r3) {
            ptr2 = 0; len2 = 0;
            throw takeObject(r2);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
    }
}
exports.discoverComponents = discoverComponents;

/**
 * Render the vault into one marketplace tree per harness — and, per the request's
 * `mode`, either swap the drifted roots into place or report the drift and
 * write nothing.
 *
 * `vfs` is the host's filesystem object; `request_json` is a serialized
 * `ExportRequest` optionally carrying a `namespace` stem (see
 * `WireExportRequest`). Returns a serialized `ExportReport`.
 *
 * # `build` and `check` are one export, because they are one path
 *
 * `mode` is `"build"`, or `"check"` to render into the overlay, compare, and
 * write nothing under any outcome. The key is optional and absent means
 * `"build"` — the same default-to-the-write choice `PublishRequest` makes.
 *
 * `check`'s verdict cannot disagree with `build`'s: there is one render and
 * one comparison behind both. See `tradecraft_core::export`'s module doc.
 *
 * The exit code is the caller's, not this layer's: `ExportReport.changed` is
 * the fact, and a `check` that exits 1 on drift is the CLI reading it.
 *
 * # Errors
 *
 * * `Refused` — the rail (an output root that is, contains, or sits inside the
 *   vault), `empty-marketplace` (a vault with nothing publishable), and
 *   everything discovery and compilation refuse.
 * * `SwapFailed` — the commit failed part-way; the message says what the
 *   rollback restored. Its own `.name`, because a host has to be able to tell
 *   "nothing happened" from "something happened and was undone".
 *
 * There is no per-unit refusal to look for inside the report: an export's
 * rails all fire before anything is staged.
 * @param {any} vfs
 * @param {string} request_json
 * @returns {string}
 */
function exportSkills(vfs, request_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(request_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.exportSkills(retptr, addHeapObject(vfs), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr2 = r0;
        var len2 = r1;
        if (r3) {
            ptr2 = 0; len2 = 0;
            throw takeObject(r2);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
    }
}
exports.exportSkills = exportSkills;

/**
 * Every target name a note's targets key and a `--target` flag may name,
 * sorted — `tradecraft_core::publish::KNOWN_TARGETS`, verbatim.
 *
 * Exported so a host validating a name off a command line checks the same
 * list the core checks a note's frontmatter against. Without it a host has to
 * keep its own copy, and a name added here would be accepted in a note and
 * rejected on the command line by the same build.
 *
 * Returns a serialized array of strings, like every other export here: one
 * wire form, and no `Array` marshalling for a list that changes at compile
 * time.
 * @returns {string}
 */
function knownTargets() {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.knownTargets(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr1 = r0;
        var len1 = r1;
        if (r3) {
            ptr1 = 0; len1 = 0;
            throw takeObject(r2);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
}
exports.knownTargets = knownTargets;

/**
 * Publish one skill to one destination.
 *
 * `vfs` is the host's filesystem object (see `js_vfs`); `request_json` is a
 * serialized `PublishRequest`, optionally carrying a `namespace` stem (see
 * `WireRequest`). Returns a serialized `PublishReport`.
 *
 * Exported to JavaScript as `publishSkill`, in the same camelCase
 * `yaml-splice-wasm` uses for `editYaml`.
 *
 * # A dry run is one more key, not one more export
 *
 * `PublishRequest` carries a `mode`: `"write"`, or `"dry-run"` to classify
 * every file and write nothing. The key is optional and absent means
 * `"write"`, so a host that has never heard of it keeps publishing exactly as
 * before, and one that wants a preview adds a key to the JSON it already
 * builds.
 *
 * There is deliberately no `dryRunSkill` beside this: the core runs one
 * publish path in both modes (see `tradecraft_core::publish`'s module doc),
 * and the mode rides the wire the core's own derives define, so the generated
 * glue and `.d.ts` are unmoved by it.
 *
 * # The namespace is read once, here, and handed on once
 *
 * The stem off the wire becomes exactly one [`Namespace`], which goes to
 * `publish_skill` as its single `ns` argument — the core then hands that same
 * value to both the read and the emit. There is no second place in this
 * function where a prefix could be spelled.
 *
 * # Errors
 *
 * A stem the core refuses throws an `Error` whose `.name` is `InvalidStem`,
 * carrying [`InvalidStem`]'s own message. A host should validate its
 * configured stem up front with [`validate_namespace`] rather than discover it
 * one publish at a time — a bad stem is a configuration fault, not a fact
 * about the note in front of it.
 * @param {any} vfs
 * @param {string} request_json
 * @returns {string}
 */
function publishSkill(vfs, request_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(request_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.publishSkill(retptr, addHeapObject(vfs), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr2 = r0;
        var len2 = r1;
        if (r3) {
            ptr2 = 0; len2 = 0;
            throw takeObject(r2);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
    }
}
exports.publishSkill = publishSkill;

/**
 * Every entity kind a publish has a projection for, in
 * [`EntityKind::KNOWN`]'s order — the kinds
 * `tradecraft_core::publish::kind_has_renderer` admits.
 *
 * Exported so a host can tell a note it should never ask about from one whose
 * state it could not determine. A marketplace and a hook are real vault
 * entities that no destination installs directly; a host that asks anyway
 * gets `no-renderer` back and has to decide whether that is drift (it is not)
 * or the shape of the vault (it is).
 *
 * A fixed vocabulary rather than a structure, so it crosses as values — see
 * [`canonical_target`].
 * @returns {string[]}
 */
function publishableKinds() {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.publishableKinds(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v1 = getArrayJsValueFromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 4, 4);
        return v1;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}
exports.publishableKinds = publishableKinds;

/**
 * One unit's publish state at one destination, for one target.
 *
 * `vfs` is the host's filesystem object; `request_json` is a serialized
 * `StatusRequest` optionally carrying a `namespace` stem (see
 * `WireStatusRequest`). Returns a serialized `status::UnitStatus`.
 *
 * # A status is a publish that writes nothing
 *
 * The core runs the classification a publish performs, in
 * `PublishMode::DryRun` over the capturing overlay, and reads its report. No
 * host may compute a state for itself: the five words come back from here
 * already decided.
 *
 * Nothing is written and no clock is read, which is why this export takes no
 * timestamp where [`publish_skill`] does.
 *
 * # Errors
 *
 * Everything a publish of the same unit would throw, unchanged: an unreadable
 * note, an unknown target, the destination rail. A destination whose manifest
 * cannot be read is NOT one of these — it comes back inside the report as
 * `state: "unknown"` with the reason, because "we could not determine a
 * state" is an answer rather than a failure.
 * @param {any} vfs
 * @param {string} request_json
 * @returns {string}
 */
function statusOf(vfs, request_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(request_json, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.statusOf(retptr, addHeapObject(vfs), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr2 = r0;
        var len2 = r1;
        if (r3) {
            ptr2 = 0; len2 = 0;
            throw takeObject(r2);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);
    }
}
exports.statusOf = statusOf;

/**
 * Check that `stem` can be a frontmatter namespace, without publishing
 * anything.
 *
 * Exists so a host can fail a bad stem where the user set it — at
 * configuration load — instead of once per note, without re-implementing
 * [`Namespace::new`]'s rules in its own language. Those rules decide which of
 * the author's keys get *deleted* at publish, so a TypeScript copy that
 * drifted by one case would accept a stem the core refuses or reads
 * differently.
 *
 * Returns nothing on success. There is deliberately nothing to return: the
 * derived forms (`prefix`, `block_key`) stay inside the core, so no host is
 * ever tempted to spell `stem + "-"` for itself.
 *
 * # Errors
 *
 * An `Error` whose `.name` is `InvalidStem` and whose message is
 * [`InvalidStem`]'s own — the offending stem and the reason, unmodified, so a
 * host prints it rather than re-words it.
 * @param {string} stem
 */
function validateNamespace(stem) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(stem, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.validateNamespace(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}
exports.validateNamespace = validateNamespace;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_boolean_get_fa956cfa2d1bd751: function(arg0) {
            const v = getObject(arg0);
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_is_function_1ff95bcc5517c252: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_a27215656b807791: function(arg0) {
            const val = getObject(arg0);
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_string_get_b0ca35b86a603356: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_createDirAll_474a733556fa843c: function() { return handleError(function (arg0, arg1, arg2) {
            getObject(arg0).createDirAll(getStringFromWasm0(arg1, arg2));
        }, arguments); },
        __wbg_exists_bbb1480243efdf43: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).exists(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_from_13e323c65fc8f464: function(arg0) {
            const ret = Array.from(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_get_78f252d074a84d0b: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_get_unchecked_6e0ad6d2a41b06f6: function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return addHeapObject(ret);
        },
        __wbg_instanceof_ArrayBuffer_4480b9e0068a8adb: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Error_1fdac9f13a8181ba: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Error;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_309b927aaf7a3fc7: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_0677c962b281d01a: function(arg0) {
            const ret = Array.isArray(getObject(arg0));
            return ret;
        },
        __wbg_isExecutable_683dc457a4e42cfa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).isExecutable(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_isSymlink_e19063c65299c590: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).isSymlink(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_length_1f0964f4a5e2c6d8: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_length_370319915dc99107: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_message_8326fb1d549bebc5: function(arg0) {
            const ret = getObject(arg0).message;
            return addHeapObject(ret);
        },
        __wbg_new_b667d279fd5aa943: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_new_cd45aabdf6073e84: function(arg0) {
            const ret = new Uint8Array(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_prototypesetcall_4770620bbe4688a0: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
        },
        __wbg_readDir_9f9b1edad9162a82: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).readDir(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_readFile_a71f867f8e3d820b: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).readFile(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_readLink_c357fdcd9578c591: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).readLink(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_realpath_ed062e85ac41e6fe: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).realpath(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_remove_437d6dc541517220: function() { return handleError(function (arg0, arg1, arg2) {
            getObject(arg0).remove(getStringFromWasm0(arg1, arg2));
        }, arguments); },
        __wbg_rename_ff10a5c9954b5e68: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).rename(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_setExecutable_55663166fbfa50bc: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).setExecutable(getStringFromWasm0(arg1, arg2), arg3 !== 0);
        }, arguments); },
        __wbg_set_name_3bbc583faefa4193: function(arg0, arg1, arg2) {
            getObject(arg0).name = getStringFromWasm0(arg1, arg2);
        },
        __wbg_stringify_b54333f60f1e4dad: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(getObject(arg0));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_writeFile_c3283003af426e58: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).writeFile(getStringFromWasm0(arg1, arg2), getArrayU8FromWasm0(arg3, arg4));
        }, arguments); },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./tradecraft_wasm_bg.js": import0,
    };
}

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(takeObject(mem.getUint32(i, true)));
    }
    return result;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export3(addHeapObject(e));
    }
}

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/tradecraft_wasm_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasmInstance = new WebAssembly.Instance(wasmModule, __wbg_get_imports());
let wasm = wasmInstance.exports;
