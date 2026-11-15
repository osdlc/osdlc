#!/usr/bin/env bash
# Measures unit test coverage and complexity for the TypeScript packages or
# the Rust crates, and prints a markdown report on stdout. It reports only:
# no threshold fails it, and a failing test is named in the report and leaves
# the exit status 0. The checks that gate a pull request are in
# packages-ci.yml and rust-ci.yml.
#
# It also writes packages/coverage/<ts|rust>.lcov, which `octocov` reads
# (.octocov.yml) to total both languages and compare them with main.
#
# `ts` needs the packages installed and built (`pnpm install && pnpm run
# build`). `rust` needs cargo-llvm-cov and the llvm-tools-preview rustup
# component. Both need jq. Tool output goes to stderr.
#
# Complexity thresholds: .oxlintrc.complexity.json for TypeScript, clippy's
# defaults for Rust (cognitive complexity 25, 100 lines a function).
#
# usage: scripts/quality-report.sh <ts|rust>
set -euo pipefail
cd "$(dirname "$0")/.."

out=packages/coverage
mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# warn <text>: a line in the report, and an annotation on GitHub Actions.
warn() {
  printf '> [!WARNING]\n> %s\n\n' "$1"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::warning::$1" >&2; fi
}

ts() {
  # Every package's `coverage` script is `vitest run --coverage`; the flags
  # add the reporters this script reads, and report a package whose tests fail.
  local failed=0
  rm -rf packages/ts/*/coverage
  pnpm -r --no-bail --if-present run coverage \
    --coverage.reporter=lcovonly --coverage.reporter=json-summary \
    --coverage.reportOnFailure >&2 || failed=1

  # vitest writes paths relative to the package; octocov wants them from the
  # repository root.
  : > "$out/ts.lcov"
  local f dir
  for f in packages/ts/*/coverage/lcov.info; do
    [ -e "$f" ] || continue
    dir="${f%/coverage/lcov.info}"
    sed "s|^SF:|SF:$dir/|" "$f" >> "$out/ts.lcov"
  done

  echo '## TypeScript coverage'
  echo
  if [ "$failed" -ne 0 ]; then
    warn 'A coverage run failed; a package with failing tests may be missing or low below.'
  fi
  echo '| Package | Lines | Functions | Branches |'
  echo '| --- | ---: | ---: | ---: |'
  jq -r '
    def cell: if .total == 0 then "–" else "\(.pct)% (\(.covered)/\(.total))" end;
    "| \(input_filename | split("/")[2]) | \(.total.lines | cell) | \(.total.functions | cell) | \(.total.branches | cell) |"
  ' packages/ts/*/coverage/coverage-summary.json
  jq -rs '
    def cell: if .total == 0 then "–" else "\(.pct)% (\(.covered)/\(.total))" end;
    def sum(k): {total: (map(.total[k].total) | add), covered: (map(.total[k].covered) | add)}
      | .pct = (if .total == 0 then 0 else (.covered * 10000 / .total | round) / 100 end);
    "| **Total** | \(sum("lines") | cell) | \(sum("functions") | cell) | \(sum("branches") | cell) |"
  ' packages/ts/*/coverage/coverage-summary.json
  echo

  # oxlint exits 0 on warnings.
  pnpm exec oxlint -c .oxlintrc.complexity.json -f json packages/ts > "$tmp/oxlint.json"

  echo '## TypeScript complexity'
  echo
  echo 'Source functions over a threshold in .oxlintrc.complexity.json. Tests and examples are left out.'
  echo
  echo '| Package | Cyclomatic complexity | Nesting depth | Function length |'
  echo '| --- | ---: | ---: | ---: |'
  jq -r '
    def count(c): map(select(.code == "eslint(\(c))")) | length;
    (.diagnostics | group_by(.filename | split("/")[2]) | .[]
      | "| \(.[0].filename | split("/")[2]) | \(count("complexity")) | \(count("max-depth")) | \(count("max-lines-per-function")) |"),
    (.diagnostics | "| **Total** | \(count("complexity")) | \(count("max-depth")) | \(count("max-lines-per-function")) |")
  ' "$tmp/oxlint.json"
  echo
  echo '<details><summary>The 25 most complex functions</summary>'
  echo
  echo '| Complexity | Function | Location |'
  echo '| ---: | --- | --- |'
  jq -r '
    [.diagnostics[] | select(.code == "eslint(complexity)")
      | (.message | capture("^(?<what>.*) has a complexity of (?<n>[0-9]+)")) as $m
      | {n: ($m.n | tonumber), what: $m.what, at: "\(.filename):\(.labels[0].span.line)"}]
    | sort_by(-.n) | .[:25][] | "| \(.n) | \(.what) | `\(.at)` |"
  ' "$tmp/oxlint.json"
  echo
  echo '</details>'
}

rust() {
  cd packages/rust
  local failed=0
  cargo llvm-cov --workspace --locked --no-report >&2 || failed=1
  cargo llvm-cov report --lcov --output-path "../../$out/rust.lcov" >&2
  cargo llvm-cov report --json --summary-only --output-path "$tmp/cov.json" >&2

  echo '## Rust coverage'
  echo
  if [ "$failed" -ne 0 ]; then
    warn 'The coverage run failed; the numbers below may be incomplete.'
  fi
  echo '| Crate | Lines | Functions | Regions |'
  echo '| --- | ---: | ---: | ---: |'
  jq -r '
    def cell: if .count == 0 then "–" else "\((.covered * 10000 / .count | round) / 100)% (\(.covered)/\(.count))" end;
    def sum(k): {count: (map(.summary[k].count) | add), covered: (map(.summary[k].covered) | add)};
    def crate: .filename | split("/packages/rust/")[1] | split("/")[0];
    .data[0].files
    | (group_by(crate) | .[]
        | "| \(.[0] | crate) | \(sum("lines") | cell) | \(sum("functions") | cell) | \(sum("regions") | cell) |"),
      "| **Total** | \(sum("lines") | cell) | \(sum("functions") | cell) | \(sum("regions") | cell) |"
  ' "$tmp/cov.json"
  echo

  # The two lints are warnings here and nowhere else: rust-ci.yml's clippy
  # run, which fails on a warning, does not turn them on. Tests are left out.
  cargo clippy --workspace --lib --bins --locked --message-format=json -- \
    -W clippy::cognitive_complexity -W clippy::too_many_lines > "$tmp/clippy.json" 2>/dev/null || failed=1

  echo '## Rust complexity'
  echo
  echo "Source functions over clippy's default for cognitive_complexity (25) or too_many_lines (100). Tests are left out."
  echo
  echo '| Crate | Lint | Finding | Location |'
  echo '| --- | --- | --- | --- |'
  jq -rs '
    [.[] | select(.reason == "compiler-message")
      | select(.message.code.code == "clippy::cognitive_complexity" or .message.code.code == "clippy::too_many_lines")
      | {lint: (.message.code.code | ltrimstr("clippy::")), text: .message.message,
         file: .message.spans[0].file_name, line: .message.spans[0].line_start}]
    | unique | sort_by(.file, .line)
    | if length == 0 then "| – | – | none | – |"
      else .[] | "| \(.file | split("/")[0]) | `\(.lint)` | \(.text) | `packages/rust/\(.file):\(.line)` |" end
  ' "$tmp/clippy.json"
}

case "${1:-}" in
  ts) ts ;;
  rust) rust ;;
  *)
    echo "usage: scripts/quality-report.sh <ts|rust>" >&2
    exit 2
    ;;
esac
