#!/usr/bin/env bash
# Measures unit test results, coverage and complexity for the TypeScript
# packages or the Rust crates, and prints a markdown report on stdout: a
# summary with one row a package, then a table for each measure. It reports
# only: no threshold fails it, and a failing test is named in the report and
# leaves the exit status 0. The checks that gate a pull request are in
# packages-ci.yml and rust-ci.yml.
#
# It also writes $QR_OUT/<ts|rust>.lcov, which `octocov` reads to total both
# languages and compare them with main.
#
# `ts` needs the packages installed and built (`pnpm install && pnpm run
# build`), with vitest and oxlint. `rust` needs cargo-llvm-cov and the
# llvm-tools-preview rustup component. Both need jq. Tool output goes to stderr.
#
# Complexity thresholds: .oxlintrc.complexity.json for TypeScript, clippy's
# defaults for Rust (cognitive complexity 25, 100 lines a function).
#
# Settings, for a repository laid out differently from osdlc/osdlc (paths are
# from QR_ROOT):
#   QR_ROOT           the repository to measure; default this script's repository
#   QR_RUST_DIR       the Cargo workspace; default packages/rust
#   QR_RUST_ARGS      which packages, for cargo llvm-cov and clippy; default --workspace
#   QR_TS_PACKAGES    a glob of the TypeScript package folders; default packages/ts/*
#   QR_OUT            where the lcov files go; default packages/coverage
#   QR_OXLINT_CONFIG  the oxlint config; default this script's .oxlintrc.complexity.json
#
# usage: scripts/quality-report.sh <ts|rust>
set -euo pipefail
tools="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "${QR_ROOT:-$tools}" && pwd)"
cd "$root"

rust_dir="${QR_RUST_DIR:-packages/rust}"
rust_dir="${rust_dir%/}"
rust_args="${QR_RUST_ARGS---workspace}"
ts_packages="${QR_TS_PACKAGES:-packages/ts/*}"
oxlint_config="${QR_OXLINT_CONFIG:-$tools/.oxlintrc.complexity.json}"
out="${QR_OUT:-packages/coverage}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
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
  local failed=0 dirs=() d
  # shellcheck disable=SC2206 # the glob is meant to expand
  for d in $ts_packages; do
    [ -d "$d" ] && dirs+=("${d%/}")
  done
  if [ "${#dirs[@]}" -eq 0 ]; then
    echo "quality-report: no TypeScript package matches $ts_packages" >&2
    exit 1
  fi
  for d in "${dirs[@]}"; do rm -rf "$d/coverage"; done
  pnpm -r --no-bail --if-present run coverage \
    --coverage.reporter=lcovonly --coverage.reporter=json-summary \
    --coverage.reportOnFailure \
    --reporter=default --reporter=json --outputFile.json=coverage/test-results.json >&2 || failed=1

  # vitest writes paths relative to the package; octocov wants them from the
  # repository root.
  : > "$out/ts.lcov"
  local f dir
  for dir in "${dirs[@]}"; do
    f="$dir/coverage/lcov.info"
    [ -e "$f" ] || continue
    sed "s|^SF:|SF:$dir/|" "$f" >> "$out/ts.lcov"
  done

  # oxlint reads ignorePatterns from the config's own folder, so a config kept
  # anywhere but the root (the default, when this script is not in the
  # measured repository) is copied there for the run. oxlint exits 0 on
  # warnings.
  local config="$oxlint_config"
  if [ "$(cd "$(dirname "$config")" && pwd)" != "$root" ]; then
    cp "$config" .oxlintrc.quality-report.json
    trap 'rm -rf "$tmp" .oxlintrc.quality-report.json' EXIT
    config=.oxlintrc.quality-report.json
  fi
  pnpm exec oxlint -c "$config" -f json "${dirs[@]}" > "$tmp/oxlint.json"
  # The package folder a file is in: the longest folder that starts its path.
  printf '%s\n' "${dirs[@]}" | jq -R . | jq -s . > "$tmp/dirs.json"

  echo '## TypeScript summary'
  echo
  if [ "$failed" -ne 0 ]; then
    warn 'A test run failed; the numbers of a package with failing tests may be missing or low.'
  fi
  echo '| Package | Tests | Line coverage | Complexity findings |'
  echo '| --- | --- | ---: | ---: |'
  local name tests lines findings
  for dir in "${dirs[@]}"; do
    name="${dir##*/}"
    # A package with no `coverage` script has no tests to report.
    jq -e '.scripts.coverage' "$dir/package.json" > /dev/null 2>&1 || continue
    tests='⚠️ no result'
    if [ -e "$dir/coverage/test-results.json" ]; then
      tests="$(jq -r '
        (if .numFailedTests > 0 or (.success | not) then "❌ \(.numFailedTests) failed, \(.numPassedTests) passed"
          else "✅ \(.numPassedTests) passed" end)
        + (if .numPendingTests > 0 then ", \(.numPendingTests) skipped" else "" end)
      ' "$dir/coverage/test-results.json")"
    fi
    lines='–'
    if [ -e "$dir/coverage/coverage-summary.json" ]; then
      lines="$(jq -r '"\(.total.lines.pct)%"' "$dir/coverage/coverage-summary.json")"
    fi
    findings="$(jq --arg d "$dir" '[.diagnostics[] | select(.filename | startswith($d + "/"))] | length' "$tmp/oxlint.json")"
    echo "| $name | $tests | $lines | $findings |"
  done
  echo

  echo '## TypeScript coverage'
  echo
  echo '| Package | Lines | Functions | Branches |'
  echo '| --- | ---: | ---: | ---: |'
  local summaries=()
  for dir in "${dirs[@]}"; do
    f="$dir/coverage/coverage-summary.json"
    [ -e "$f" ] || continue
    summaries+=("$f")
    jq -r --arg p "${dir##*/}" '
      def cell: if .total == 0 then "–" else "\(.pct)% (\(.covered)/\(.total))" end;
      "| \($p) | \(.total.lines | cell) | \(.total.functions | cell) | \(.total.branches | cell) |"
    ' "$f"
  done
  [ "${#summaries[@]}" -gt 0 ] && jq -rs '
    def cell: if .total == 0 then "–" else "\(.pct)% (\(.covered)/\(.total))" end;
    def sum(k): {total: (map(.total[k].total) | add), covered: (map(.total[k].covered) | add)}
      | .pct = (if .total == 0 then 0 else (.covered * 10000 / .total | round) / 100 end);
    "| **Total** | \(sum("lines") | cell) | \(sum("functions") | cell) | \(sum("branches") | cell) |"
  ' "${summaries[@]}"
  echo

  echo '## TypeScript complexity'
  echo
  echo 'Source functions over a threshold in .oxlintrc.complexity.json. Tests and examples are left out.'
  echo
  echo '| Package | Cyclomatic complexity | Nesting depth | Function length |'
  echo '| --- | ---: | ---: | ---: |'
  jq -r --slurpfile dirs "$tmp/dirs.json" '
    def count(c): map(select(.code == "eslint(\(c))")) | length;
    def package: . as $f | [$dirs[0][] | select(. as $d | $f | startswith($d + "/"))] | max_by(length) // $f | split("/") | last;
    (.diagnostics | group_by(.filename | package) | .[]
      | "| \(.[0].filename | package) | \(count("complexity")) | \(count("max-depth")) | \(count("max-lines-per-function")) |"),
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
  cd "$rust_dir"
  local failed=0 args=()
  # shellcheck disable=SC2206 # QR_RUST_ARGS is split into words on purpose
  args=($rust_args)
  # --no-fail-fast: a crate with a failing test does not hide the crates after it.
  cargo llvm-cov "${args[@]}" --locked --no-report --no-fail-fast 2>&1 | tee "$tmp/test.log" >&2 || failed=1
  cargo llvm-cov report --lcov --output-path "$out/rust.lcov" >&2
  cargo llvm-cov report --json --summary-only --output-path "$tmp/cov.json" >&2

  # The two lints are warnings here and nowhere else: rust-ci.yml's clippy
  # run, which fails on a warning, does not turn them on. Tests are left out.
  cargo clippy "${args[@]}" --lib --bins --locked --message-format=json -- \
    -W clippy::cognitive_complexity -W clippy::too_many_lines > "$tmp/clippy.json" 2>/dev/null || failed=1

  # Each package's name, folder and the targets whose test binaries carry its
  # name. A file belongs to the package with the longest folder that starts
  # its path; the rows are named by package.
  cargo metadata --no-deps --format-version 1 --locked > "$tmp/metadata.json"
  jq '
    [.packages[] | {name, dir: (.manifest_path | rtrimstr("Cargo.toml")),
      targets: [.targets[] | select(.kind | any(. == "lib" or . == "rlib" or . == "cdylib" or . == "proc-macro" or . == "bin"))
        | .name | gsub("-"; "_")]}]
  ' "$tmp/metadata.json" > "$tmp/packages.json"
  local workspace
  workspace="$(jq -r .workspace_root "$tmp/metadata.json")"

  # clippy names files from the workspace root; make them absolute like the
  # coverage report's.
  jq -s --arg ws "$workspace/" '
    [.[] | select(.reason == "compiler-message")
      | select(.message.code.code == "clippy::cognitive_complexity" or .message.code.code == "clippy::too_many_lines")
      | {lint: (.message.code.code | ltrimstr("clippy::")), text: .message.message,
         file: (.message.spans[0].file_name | if startswith("/") then . else $ws + . end), line: .message.spans[0].line_start}]
    | unique | sort_by(.file, .line)
  ' "$tmp/clippy.json" > "$tmp/findings.json"

  # cargo names a test binary, not its crate. A crate's unit tests run first
  # and their binary is named after its lib or bin target, which the map
  # turns into the package; the integration tests that follow belong to the
  # same package.
  jq -r '.[] | .name as $p | .targets[] | "\(.)\t\($p)"' "$tmp/packages.json" > "$tmp/targets.tsv"
  awk -F'\t' '
    FNR == NR { pkg[$1] = $2; next }
    { gsub(/\033\[[0-9;]*m/, "") }
    /Running unittests / {
      name = $0; sub(/.*\/deps\//, "", name); sub(/-[0-9a-f]+\)$/, "", name)
      crate = (name in pkg) ? pkg[name] : name
    }
    /^test result: / && crate != "" {
      split($0, w, " ")
      passed[crate] += w[4]; failures[crate] += w[6]; ignored[crate] += w[8]
    }
    END { for (c in passed) printf "%s\t%d\t%d\t%d\n", c, passed[c], failures[c], ignored[c] }
  ' "$tmp/targets.tsv" "$tmp/test.log" > "$tmp/tests.tsv"

  # jq definitions shared by the tables: a file's package, and a path from QR_ROOT.
  local defs='
    def crate: . as $f | [$pk[0][] | select(.dir as $d | $f | startswith($d))] | max_by(.dir | length) | .name // "(other)";
    def from_root: ltrimstr($root + "/");
  '

  echo '## Rust summary'
  echo
  if [ "$failed" -ne 0 ]; then
    warn 'A test or clippy run failed; the numbers below may be incomplete.'
  fi
  echo '| Crate | Tests | Line coverage | Complexity findings |'
  echo '| --- | --- | ---: | ---: |'
  jq -rn --rawfile tests "$tmp/tests.tsv" --slurpfile cov "$tmp/cov.json" --slurpfile findings "$tmp/findings.json" \
    --slurpfile pk "$tmp/packages.json" --arg root "$root" "$defs"'
    def tests: if . == null or .passed + .failed + .ignored == 0 then "none" else
      (if .failed > 0 then "❌ \(.failed) failed, \(.passed) passed" else "✅ \(.passed) passed" end)
      + (if .ignored > 0 then ", \(.ignored) ignored" else "" end) end;
    def lines: if . == null or .count == 0 then "–" else "\((.covered * 10000 / .count | round) / 100)%" end;
    ($tests | split("\n") | map(select(length > 0) | split("\t")
      | {key: .[0], value: {passed: (.[1] | tonumber), failed: (.[2] | tonumber), ignored: (.[3] | tonumber)}})
      | from_entries) as $t
    | ($cov[0].data[0].files | group_by(.filename | crate)
      | map({key: (.[0].filename | crate), value: {count: (map(.summary.lines.count) | add), covered: (map(.summary.lines.covered) | add)}})
      | from_entries) as $c
    | ($findings[0] | group_by(.file | crate) | map({key: (.[0].file | crate), value: length}) | from_entries) as $f
    | (($t | keys) + ($c | keys) | unique)[] as $k
    | "| \($k) | \($t[$k] | tests) | \($c[$k] | lines) | \($f[$k] // 0) |"
  '
  echo

  echo '## Rust coverage'
  echo
  echo '| Crate | Lines | Functions | Regions |'
  echo '| --- | ---: | ---: | ---: |'
  jq -r --slurpfile pk "$tmp/packages.json" --arg root "$root" "$defs"'
    def cell: if .count == 0 then "–" else "\((.covered * 10000 / .count | round) / 100)% (\(.covered)/\(.count))" end;
    def sum(k): {count: (map(.summary[k].count) | add), covered: (map(.summary[k].covered) | add)};
    .data[0].files
    | (group_by(.filename | crate) | .[]
        | "| \(.[0].filename | crate) | \(sum("lines") | cell) | \(sum("functions") | cell) | \(sum("regions") | cell) |"),
      "| **Total** | \(sum("lines") | cell) | \(sum("functions") | cell) | \(sum("regions") | cell) |"
  ' "$tmp/cov.json"
  echo

  echo '## Rust complexity'
  echo
  echo "Source functions over clippy's default for cognitive_complexity (25) or too_many_lines (100). Tests are left out."
  echo
  echo '| Crate | Lint | Finding | Location |'
  echo '| --- | --- | --- | --- |'
  jq -r --slurpfile pk "$tmp/packages.json" --arg root "$root" "$defs"'
    if length == 0 then "| – | – | none | – |"
    else .[] | "| \(.file | crate) | `\(.lint)` | \(.text) | `\(.file | from_root):\(.line)` |" end
  ' "$tmp/findings.json"
}

case "${1:-}" in
  ts) ts ;;
  rust) rust ;;
  *)
    echo "usage: scripts/quality-report.sh <ts|rust>" >&2
    exit 2
    ;;
esac
