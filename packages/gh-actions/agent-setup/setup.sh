#!/usr/bin/env bash
# Installs the $HARNESS CLI (claude | codex | cursor) at $VERSION, then the
# plugins in $PLUGINS from the marketplaces in $MARKETPLACES through
# skillwright. DRY_RUN=1 prints each command instead of running it.
set -euo pipefail

: "${HARNESS:?HARNESS is required (claude | codex | cursor)}"
VERSION="${VERSION:-}"
MARKETPLACES="${MARKETPLACES:-}"
PLUGINS="${PLUGINS:-}"
SKILLWRIGHT_VERSION="${SKILLWRIGHT_VERSION:-0.7.0}"
SHA256="${SHA256:-}"
DRY_RUN="${DRY_RUN:-}"

# Inputs from Windows-edited workflows can carry carriage returns.
MARKETPLACES="${MARKETPLACES//$'\r'/}"
PLUGINS="${PLUGINS//$'\r'/}"
VERSION="${VERSION//$'\r'/}"
SHA256="${SHA256//$'\r'/}"

bin_dir="$HOME/.local/bin"
work="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/agent-setup"

die() { echo "agent-setup: $*" >&2; exit 1; }

run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

case "$HARNESS" in
  claude) default_version=2.1.319; version_re='^[0-9]+\.[0-9]+\.[0-9]+$' ;;
  codex) default_version=0.162.0; version_re='^[0-9]+\.[0-9]+\.[0-9]+$' ;;
  cursor) default_version=2026.11.05-86047df; version_re='^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9a-f]+$' ;;
  *) die "harness must be claude, codex or cursor, not '$HARNESS'" ;;
esac
VERSION="${VERSION:-$default_version}"
[[ "$VERSION" =~ $version_re ]] || die "invalid $HARNESS version '$VERSION' (must match $version_re)"
[ -z "$SHA256" ] || [[ "$SHA256" =~ ^[0-9a-f]{64}$ ]] || die "sha256 must be 64 lowercase hex characters"
[ -z "$SHA256" ] || [ "$HARNESS" = cursor ] || die "sha256 checks the cursor tarball; $HARNESS has no download to check"
[[ "$SKILLWRIGHT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "invalid skillwright version '$SKILLWRIGHT_VERSION'"

export PATH="$bin_dir:$PATH"
run mkdir -p "$bin_dir" "$work"

install_claude() {
  # The official installer takes the version as its argument.
  run curl -fsSL --proto '=https' --tlsv1.2 --retry 3 https://claude.ai/install.sh -o "$work/claude-install.sh"
  run bash "$work/claude-install.sh" "$VERSION"
  cli="$bin_dir/claude"
}

install_codex() {
  # npm pins the version; --prefix keeps the binary in the same bin dir.
  run npm install --global --prefix "$HOME/.local" "@openai/codex@$VERSION"
  cli="$bin_dir/codex"
}

install_cursor() {
  # cursor.com/install hard-codes the current build and takes no version, so
  # this fetches the build's tarball from the URL that script uses and links
  # it the way that script does.
  local os arch dest want
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) die "cursor is not available on $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) die "cursor is not available on $(uname -m)" ;;
  esac
  dest="$HOME/.local/share/cursor-agent/versions/$VERSION"
  want="$SHA256"
  if [ -z "$want" ] && [ "$VERSION" = "$default_version" ]; then
    case "$os-$arch" in
      linux-x64) want=170b77786cbf4c93064d64fff12b71a178b968730561c64afc2e8e752535442e ;;
      linux-arm64) want=131554bfdbf683d8ebfef83a2bb46ac4e5d060f198711040b07ed063c2471871 ;;
      darwin-x64) want=75f345ce7638ff136e5cd09c45c3b2de4e73e5f590b50655e01e826c02bd7cfa ;;
      darwin-arm64) want=67847e47e3ebd32b64c3fb4e6f36d475f1971b76e033b0ed6c9e01a3c1b440d7 ;;
    esac
  fi
  [ -n "$want" ] || die "cursor $VERSION has no embedded checksum for $os-$arch; download https://downloads.cursor.com/lab/$VERSION/$os/$arch/agent-cli-package.tar.gz yourself, run sha256sum on it, and pass the result as the sha256 input"
  run curl -fsSL --proto '=https' --tlsv1.2 --retry 3 "https://downloads.cursor.com/lab/$VERSION/$os/$arch/agent-cli-package.tar.gz" -o "$work/cursor-agent.tar.gz"
  if [ "$DRY_RUN" = 1 ]; then
    echo "+ check sha256 of $work/cursor-agent.tar.gz is $want"
  else
    local got
    if command -v sha256sum > /dev/null 2>&1; then
      got="$(sha256sum "$work/cursor-agent.tar.gz" | cut -d' ' -f1)"
    elif command -v shasum > /dev/null 2>&1; then
      got="$(shasum -a 256 "$work/cursor-agent.tar.gz" | cut -d' ' -f1)"
    else
      die "needs sha256sum or shasum to check the cursor download"
    fi
    [ "$got" = "$want" ] || die "cursor checksum mismatch: expected $want, got $got"
  fi
  run rm -rf "$dest"
  run mkdir -p "$dest"
  run tar --strip-components=1 -xzf "$work/cursor-agent.tar.gz" -C "$dest"
  run ln -sf "$dest/cursor-agent" "$bin_dir/agent"
  run ln -sf "$dest/cursor-agent" "$bin_dir/cursor-agent"
  cli="$bin_dir/agent"
}

# market_field <name> <1|2>: the URL (1) or ref (2) of a declared marketplace.
market_field() {
  local line spec ref name
  while IFS= read -r line; do
    [ -n "${line//[[:space:]]/}" ] || continue
    ref=
    read -r spec ref _ <<< "$line"
    name="${spec%%=*}"
    [ "$name" = "$1" ] || continue
    if [ "$2" = 1 ]; then echo "${spec#*=}"; else echo "$ref"; fi
    return 0
  done <<< "$MARKETPLACES"
  return 1
}

check_marketplaces() {
  local line spec ref extra name url host seen=" "
  while IFS= read -r line; do
    [ -n "${line//[[:space:]]/}" ] || continue
    ref= extra=
    read -r spec ref extra <<< "$line"
    [ -z "$extra" ] || die "marketplace '$line' has more than two fields; expected name=https://git-url [ref]"
    name="${spec%%=*}"
    url="${spec#*=}"
    [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$url" == https://* && "$url" != "$spec" ]] \
      || die "marketplace '$line' must be name=https://git-url [ref]"
    host="${url#https://}"
    host="${host%%/*}"
    [[ -n "$host" && "$host" != *@* ]] || die "marketplace URL '$url' must have a host and no user info"
    [[ -z "$ref" || "$ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || die "invalid ref '$ref'"
    case "$seen" in *" $name "*) die "marketplace '$name' is listed twice" ;; esac
    seen="$seen$name "
  done <<< "$MARKETPLACES"
}

# Plugin names wanted from marketplace $1, space separated.
plugins_of() {
  local plugin
  while IFS= read -r plugin; do
    plugin="${plugin//[[:space:]]/}"
    [ -n "$plugin" ] || continue
    [ "${plugin#*@}" = "$1" ] && printf '%s ' "${plugin%@*}"
  done <<< "$PLUGINS"
  return 0
}

# Validates the marketplaces and plugins and fills $markets with the
# marketplaces to register, before anything is installed.
plan_plugins() {
  local plugin market line
  markets=()

  check_marketplaces
  while IFS= read -r plugin; do
    plugin="${plugin//[[:space:]]/}"
    [ -n "$plugin" ] || continue
    [[ "$plugin" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$ ]] || die "plugin '$plugin' must be plugin@marketplace"
    market="${plugin#*@}"
    market_field "$market" 1 > /dev/null || die "plugin '$plugin' names marketplace '$market', which is not in marketplaces"
    case " ${markets[*]:-} " in *" $market "*) ;; *) markets+=("$market") ;; esac
  done <<< "$PLUGINS"

  if [ "$HARNESS" = cursor ]; then
    [ "${#markets[@]}" -eq 0 ] || die "plugins are not supported on cursor: skillwright only registers its marketplaces (cursor-agent has no per-plugin install); list marketplaces alone"
    while IFS= read -r line; do
      if [ -n "${line//[[:space:]]/}" ]; then markets+=("${line%%=*}"); fi
    done <<< "$MARKETPLACES"
  elif [ "${#markets[@]}" -eq 0 ]; then
    die "marketplaces given without plugins; skillwright installs plugins, not bare marketplaces, on $HARNESS"
  fi

  if [ "$HARNESS" = claude ]; then
    for market in ${markets[@]+"${markets[@]}"}; do
      [ -z "$(market_field "$market" 2)" ] || die "claude cannot pin a marketplace ref through skillwright (claude takes no --git-ref); drop the ref from '$market'"
    done
  fi
}

markets=()
want_plugins=
[ -z "${MARKETPLACES//[[:space:]]/}${PLUGINS//[[:space:]]/}" ] || want_plugins=1
if [ -n "$want_plugins" ]; then
  plan_plugins
fi

cli=
"install_$HARNESS"
[ "$DRY_RUN" = 1 ] || [ -x "$cli" ] || die "$HARNESS installed but $cli is not executable"
run "$cli" --version

if [ "$DRY_RUN" = 1 ]; then
  echo "+ echo $bin_dir >> \$GITHUB_PATH"
elif [ -n "${GITHUB_PATH:-}" ]; then
  echo "$bin_dir" >> "$GITHUB_PATH"
fi

install_plugins() {
  local market names url ref plugin vault
  local -a args

  # skillwright pins by release; install.sh checks the binary against the
  # release's SHA256SUMS.
  run curl -fsSL --proto '=https' --tlsv1.2 --retry 3 "https://github.com/osdlc/skillwright/releases/download/skillwright/v$SKILLWRIGHT_VERSION/install.sh" -o "$work/skillwright-install.sh"
  run sh "$work/skillwright-install.sh" --version "$SKILLWRIGHT_VERSION" --to "$bin_dir"

  # skillwright wants a vault and a build folder even when the marketplace is
  # remote, so each marketplace gets an empty vault named after it: the folder
  # name is the marketplace name that plugin ids end in.
  for market in ${markets[@]+"${markets[@]}"}; do
    url="$(market_field "$market" 1)"
    ref="$(market_field "$market" 2)"
    names="$(plugins_of "$market")"
    vault="$work/vaults/$market"
    args=()
    for plugin in $names; do args+=(--plugin "$plugin"); done
    args+=(--git-url "$url")
    [ -z "$ref" ] || args+=(--git-ref "$ref")
    run mkdir -p "$vault/plugins" "$vault/out"
    run skillwright harness install "$HARNESS" --vault "$vault" --path "$vault/out" --yes ${args[@]+"${args[@]}"}
  done
}

if [ -n "$want_plugins" ]; then
  install_plugins
fi

if [ "$DRY_RUN" = 1 ]; then
  echo "+ echo cli-path=$cli >> \$GITHUB_OUTPUT"
elif [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "cli-path=$cli" >> "$GITHUB_OUTPUT"
fi
