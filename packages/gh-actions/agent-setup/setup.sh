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
DRY_RUN="${DRY_RUN:-}"

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
  claude) default_version=2.1.319 ;;
  codex) default_version=0.162.0 ;;
  cursor) default_version=2026.11.05-86047df ;;
  *) die "harness must be claude, codex or cursor, not '$HARNESS'" ;;
esac
VERSION="${VERSION:-$default_version}"
[[ "$VERSION" =~ ^[0-9A-Za-z._-]+$ ]] || die "invalid version '$VERSION'"
[[ "$SKILLWRIGHT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "invalid skillwright version '$SKILLWRIGHT_VERSION'"

export PATH="$bin_dir:$PATH"
run mkdir -p "$bin_dir" "$work"

install_claude() {
  # The official installer takes the version as its argument.
  run curl -fsSL https://claude.ai/install.sh -o "$work/claude-install.sh"
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
  local os arch dest
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
  run curl -fsSL "https://downloads.cursor.com/lab/$VERSION/$os/$arch/agent-cli-package.tar.gz" -o "$work/cursor-agent.tar.gz"
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
    [ -n "${line// /}" ] || continue
    read -r spec ref <<< "$line"
    name="${spec%%=*}"
    [ "$name" = "$1" ] || continue
    if [ "$2" = 1 ]; then echo "${spec#*=}"; else echo "$ref"; fi
    return 0
  done <<< "$MARKETPLACES"
  return 1
}

check_marketplaces() {
  local line spec ref name url
  while IFS= read -r line; do
    [ -n "${line// /}" ] || continue
    read -r spec ref <<< "$line"
    name="${spec%%=*}"
    url="${spec#*=}"
    [[ "$name" =~ ^[A-Za-z0-9._-]+$ && "$url" == https://* && "$url" != "$spec" ]] \
      || die "marketplace '$line' must be name=https://git-url [ref]"
    [[ -z "$ref" || "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] || die "invalid ref '$ref'"
  done <<< "$MARKETPLACES"
}

# Plugin names wanted from marketplace $1, space separated.
plugins_of() {
  local plugin
  while IFS= read -r plugin; do
    plugin="${plugin// /}"
    [ -n "$plugin" ] || continue
    [[ "$plugin" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$ ]] || die "plugin '$plugin' must be plugin@marketplace"
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
    plugin="${plugin// /}"
    [ -n "$plugin" ] || continue
    [[ "$plugin" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$ ]] || die "plugin '$plugin' must be plugin@marketplace"
    market="${plugin#*@}"
    market_field "$market" 1 > /dev/null || die "plugin '$plugin' names marketplace '$market', which is not in marketplaces"
    case " ${markets[*]:-} " in *" $market "*) ;; *) markets+=("$market") ;; esac
  done <<< "$PLUGINS"

  if [ "$HARNESS" = cursor ]; then
    [ "${#markets[@]}" -eq 0 ] || die "plugins are not supported on cursor: skillwright only registers its marketplaces (cursor-agent has no per-plugin install); list marketplaces alone"
    while IFS= read -r line; do
      [ -n "${line// /}" ] && markets+=("${line%%=*}")
    done <<< "$MARKETPLACES"
  elif [ "${#markets[@]}" -eq 0 ]; then
    die "marketplaces given without plugins; skillwright installs plugins, not bare marketplaces, on $HARNESS"
  fi

  if [ "$HARNESS" = claude ]; then
    for market in "${markets[@]}"; do
      [ -z "$(market_field "$market" 2)" ] || die "claude cannot pin a marketplace ref through skillwright (claude takes no --git-ref); drop the ref from '$market'"
    done
  fi
}

markets=()
if [ -n "${MARKETPLACES// /}${PLUGINS// /}" ]; then
  plan_plugins
fi

cli=
"install_$HARNESS"
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
  run curl -fsSL "https://github.com/osdlc/skillwright/releases/download/skillwright/v$SKILLWRIGHT_VERSION/install.sh" -o "$work/skillwright-install.sh"
  run sh "$work/skillwright-install.sh" --version "$SKILLWRIGHT_VERSION" --to "$bin_dir"

  # skillwright wants a vault and a build folder even when the marketplace is
  # remote, so each marketplace gets an empty vault named after it: the folder
  # name is the marketplace name that plugin ids end in.
  for market in "${markets[@]}"; do
    url="$(market_field "$market" 1)"
    ref="$(market_field "$market" 2)"
    names="$(plugins_of "$market")"
    vault="$work/vaults/$market"
    args=()
    for plugin in $names; do args+=(--plugin "$plugin"); done
    args+=(--git-url "$url")
    [ -z "$ref" ] || args+=(--git-ref "$ref")
    run mkdir -p "$vault/plugins" "$vault/out"
    run skillwright harness install "$HARNESS" --vault "$vault" --path "$vault/out" --yes "${args[@]}"
  done
}

if [ -n "${MARKETPLACES// /}${PLUGINS// /}" ]; then
  install_plugins
fi

if [ "$DRY_RUN" = 1 ]; then
  echo "+ echo cli-path=$cli >> \$GITHUB_OUTPUT"
elif [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "cli-path=$cli" >> "$GITHUB_OUTPUT"
fi
