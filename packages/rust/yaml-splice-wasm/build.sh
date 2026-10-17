#!/usr/bin/env bash
# Build the wasm artifact for the yaml-splice npm package.
#
#   cargo build --release --target wasm32-unknown-unknown   (the cdylib)
#     -> wasm-bindgen --target nodejs                        (JS/TS glue)
#       -> wasm-opt -Oz                                      (size)
#         -> $OUT_DIR, default packages/ts/yaml-splice/wasm/ (the npm package's
#            wasm/; that package is not in this repo yet, so set OUT_DIR or
#            the directory is created)
#
# PINNED TOOL VERSIONS. The artifact is only reproducible against these:
#   * wasm-bindgen CLI : 0.2.126   (MUST equal the wasm-bindgen crate pin in
#                                    packages/rust/Cargo.toml; a
#                                    mismatch silently emits wrong glue)
#   * binaryen/wasm-opt: version_131
#   * rustc            : the pin in packages/rust/rust-toolchain.toml, with
#                        the wasm32-unknown-unknown target added
#                        (`rustup target add wasm32-unknown-unknown`)
#
# Same toolchain and OS in, byte-identical output out. Builds on different
# OSes differ in metadata bytes, so compare an artifact by its behaviour (the
# conformance corpus in yaml-splice/tests/fixtures/), not its bytes.
# Override the tool locations with WASM_BINDGEN / WASM_OPT if they are not on
# PATH (e.g. prebuilt tarballs); otherwise PATH is used. CARGO_TARGET_DIR is
# honoured. OUT_DIR overrides the output folder.
set -euo pipefail

REQUIRED_WASM_BINDGEN="0.2.126"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
WORKSPACE="$REPO_ROOT/packages/rust"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/packages/ts/yaml-splice/wasm}"
TARGET_DIR="${CARGO_TARGET_DIR:-$WORKSPACE/target}"
CRATE_WASM="$TARGET_DIR/wasm32-unknown-unknown/release/yaml_splice_wasm.wasm"

WASM_BINDGEN="${WASM_BINDGEN:-wasm-bindgen}"
WASM_OPT="${WASM_OPT:-wasm-opt}"

# --- tool presence + version pin -------------------------------------------
if ! command -v "$WASM_BINDGEN" >/dev/null 2>&1; then
  echo "error: wasm-bindgen not found (looked for '$WASM_BINDGEN'). Install the" >&2
  echo "       pinned wasm-bindgen-cli $REQUIRED_WASM_BINDGEN or set \$WASM_BINDGEN." >&2
  exit 1
fi
if ! command -v "$WASM_OPT" >/dev/null 2>&1; then
  echo "error: wasm-opt not found (looked for '$WASM_OPT'). Install binaryen or" >&2
  echo "       set \$WASM_OPT." >&2
  exit 1
fi

GOT_VERSION="$("$WASM_BINDGEN" --version | awk '{print $2}')"
if [ "$GOT_VERSION" != "$REQUIRED_WASM_BINDGEN" ]; then
  echo "error: wasm-bindgen version mismatch: need $REQUIRED_WASM_BINDGEN, got $GOT_VERSION." >&2
  echo "       The CLI and the crate pin must match or the glue is wrong." >&2
  exit 1
fi

# --- 1. compile the cdylib to wasm32 ---------------------------------------
echo "[1/3] cargo build --release --target wasm32-unknown-unknown"
cargo build --manifest-path "$WORKSPACE/Cargo.toml" --locked \
  -p yaml-splice-wasm --release --target wasm32-unknown-unknown

# --- 2. generate the nodejs glue -------------------------------------------
# Rebuild the output dir from scratch so a removed file never lingers.
echo "[2/3] wasm-bindgen --target nodejs -> $OUT_DIR"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
"$WASM_BINDGEN" --target nodejs --out-dir "$OUT_DIR" "$CRATE_WASM"

# --- 3. size-optimize the wasm in place ------------------------------------
# wasm-opt reads and rewrites the _bg.wasm the glue `require`s.
echo "[3/3] wasm-opt -Oz"
BG_WASM="$OUT_DIR/yaml_splice_wasm_bg.wasm"
"$WASM_OPT" -Oz "$BG_WASM" -o "$BG_WASM.tmp"
mv "$BG_WASM.tmp" "$BG_WASM"

# wasm-bindgen's nodejs target emits CommonJS glue (require/__dirname/exports).
# The TS package is "type": "module", so mark this dir CommonJS or Node reads
# the .js as ESM and the glue breaks. Emitted here (not written by hand) so
# the `rm -rf` above never strips it and a rebuild reproduces it, in the
# layout a formatter gives it.
printf '{\n  "type": "commonjs"\n}\n' > "$OUT_DIR/package.json"

echo "done. artifact:"
ls -la "$OUT_DIR"
