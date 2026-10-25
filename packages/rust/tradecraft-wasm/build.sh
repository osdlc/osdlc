#!/usr/bin/env bash
# Build the tradecraft wasm artifact: tradecraft-core for JavaScript, with the
# host filesystem supplied from JS.
#
#   cargo build --release --target wasm32-unknown-unknown   (the cdylib)
#     -> wasm-bindgen --target nodejs                        (JS/TS glue)
#       -> wasm-opt -Oz                                      (size)
#         -> $OUT_DIR, default packages/rust/target/tradecraft-wasm/
#
# No npm package ships this artifact yet. The package that does will set
# OUT_DIR to its own folder.
#
# Pinned tool versions. The artifact is only reproducible with these:
#   * wasm-bindgen CLI : 0.2.126   (must equal the wasm-bindgen crate pin in
#                                    packages/rust/Cargo.toml; a
#                                    mismatch silently emits wrong glue)
#   * binaryen/wasm-opt: version_131
#   * rustc            : the pin in packages/rust/rust-toolchain.toml, with
#                        the wasm32-unknown-unknown target added
#                        (`rustup target add wasm32-unknown-unknown`)
#
# Same tools and source in, byte-identical output out: machine paths are
# remapped (below), so the build machine does not show in the bytes.
# Override the tool locations with WASM_BINDGEN / WASM_OPT if they are not on
# PATH (for example, prebuilt tarballs). CARGO_TARGET_DIR is honoured.
# OUT_DIR overrides the output folder.
set -euo pipefail

REQUIRED_WASM_BINDGEN="0.2.126"
REQUIRED_WASM_OPT="131"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
WORKSPACE="$REPO_ROOT/packages/rust"
OUT_DIR="${OUT_DIR:-$WORKSPACE/target/tradecraft-wasm}"
# Absolute, because the build below runs from the workspace.
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
TARGET_DIR="${CARGO_TARGET_DIR:-$WORKSPACE/target}"
CRATE_WASM="$TARGET_DIR/wasm32-unknown-unknown/release/tradecraft_wasm.wasm"

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

GOT_WASM_OPT="$("$WASM_OPT" --version | awk '{print $3}')"
if [ "$GOT_WASM_OPT" != "$REQUIRED_WASM_OPT" ]; then
  echo "error: wasm-opt version mismatch: need $REQUIRED_WASM_OPT, got $GOT_WASM_OPT." >&2
  echo "       CI compares the built bytes with the committed ones." >&2
  exit 1
fi

# --- 1. compile the cdylib to wasm32 ---------------------------------------
# rustup picks the toolchain from rust-toolchain.toml in the current
# directory, so run from the workspace. An inherited RUSTUP_TOOLCHAIN would
# override that file, so unset it.
cd "$WORKSPACE"
unset RUSTUP_TOOLCHAIN

# Map the machine's paths to fixed names, so no home directory ends up in the
# wasm's panic messages and every machine gets the same bytes. The standard
# library's source maps to `/rustc/<commit>`, the path rustc uses when the
# rust-src component is not installed, so the bytes do not depend on whether
# it is. The sysroot must be read after the `cd`: from anywhere else rustc
# reports the default toolchain's sysroot, not the pinned one's.
SYSROOT="$(rustc --print sysroot)"
RUSTC_COMMIT="$(rustc -vV | sed -n 's/^commit-hash: //p')"
export RUSTFLAGS="--remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=/cargo --remap-path-prefix=$SYSROOT/lib/rustlib/src/rust=/rustc/$RUSTC_COMMIT --remap-path-prefix=$WORKSPACE=/src"

echo "[1/3] cargo build --release --target wasm32-unknown-unknown"
cargo build --locked \
  -p tradecraft-wasm --release --target wasm32-unknown-unknown

# --- 2. generate the nodejs glue -------------------------------------------
# Rebuild the output dir from scratch so a removed file never lingers.
echo "[2/3] wasm-bindgen --target nodejs -> $OUT_DIR"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
"$WASM_BINDGEN" --target nodejs --out-dir "$OUT_DIR" "$CRATE_WASM"

# --- 3. size-optimize the wasm in place ------------------------------------
# wasm-opt reads and rewrites the _bg.wasm the glue `require`s. It also drops
# the "producers" section, which names the tool builds: a wasm-bindgen built
# with `cargo install` writes "0.2.126", a release binary "0.2.126 (<commit>)".
#
# `--enable-bulk-memory` tells the validator that the `memory.copy` rustc
# emits for this crate is legal. binaryen 131 defaults to a feature set that
# predates it and would refuse the module. It changes no bytes on its own.
echo "[3/3] wasm-opt -Oz --strip-producers"
BG_WASM="$OUT_DIR/tradecraft_wasm_bg.wasm"
"$WASM_OPT" -Oz --strip-producers --enable-bulk-memory "$BG_WASM" -o "$BG_WASM.tmp"
mv "$BG_WASM.tmp" "$BG_WASM"

# wasm-bindgen's nodejs target emits CommonJS glue (require/__dirname/exports).
# An npm package with "type": "module" would read the .js as ESM and break
# the glue, so mark this dir CommonJS. Emitted here (not written by hand) so
# the `rm -rf` above never strips it and a rebuild reproduces it, in the
# layout a formatter gives it.
printf '{\n  "type": "commonjs"\n}\n' > "$OUT_DIR/package.json"

# The wasm is meant to be published, so it must not name the machine that
# built it. A path left here means the remapping above missed one.
LEAKED="$(strings "$BG_WASM" | grep -cE -e '/Users/|/home/|/root/' -e "$HOME" -e "$REPO_ROOT" || true)"
if [ "$LEAKED" != "0" ]; then
  echo "error: $BG_WASM still contains $LEAKED machine path(s):" >&2
  strings "$BG_WASM" | grep -E -e '/Users/|/home/|/root/' -e "$HOME" -e "$REPO_ROOT" | head -5 >&2
  exit 1
fi

echo "done. artifact:"
ls -la "$OUT_DIR"
