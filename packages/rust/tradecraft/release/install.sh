#!/bin/sh
# Installs the tradecraft binary from a GitHub Release of osdlc/osdlc.
#
#   curl -fsSL https://github.com/osdlc/osdlc/releases/download/tradecraft/v<version>/install.sh | sh
#   sh install.sh [--version <X.Y.Z>] [--to <dir>]
#
# It picks the asset for this OS and CPU (macOS or Linux, arm64 or x86_64),
# checks it against the release's SHA256SUMS and installs it as
# <dir>/tradecraft. The default dir is ~/.local/bin. The copy attached to a
# release installs that release; the copy in the repository installs the
# newest tradecraft release unless --version is given.
#
# TRADECRAFT_DOWNLOAD_BASE overrides the download URL up to the tag, for tests.
set -eu

DEFAULT_VERSION=''
REPO='osdlc/osdlc'
BINARY='tradecraft'
TAG_PREFIX='tradecraft/v'

version="$DEFAULT_VERSION"
to="${HOME}/.local/bin"

say() { printf '%s\n' "install.sh: $*" >&2; }
die() { say "$*"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --version) [ $# -ge 2 ] || die '--version needs a value'; version="${2#v}"; shift 2 ;;
    --to) [ $# -ge 2 ] || die '--to needs a value'; to="$2"; shift 2 ;;
    -h|--help) sed -n '2,13p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

fetch() { # url dest
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    die 'needs curl or wget'
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    die 'needs sha256sum or shasum to check the download'
  fi
}

case "$(uname -s)" in
  Darwin) os='apple-darwin' ;;
  Linux) os='unknown-linux-musl' ;;
  *) die "no build for $(uname -s); see https://github.com/${REPO}/tree/main/packages/rust/tradecraft#platforms" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) cpu='aarch64' ;;
  x86_64|amd64) cpu='x86_64' ;;
  *) die "no build for CPU $(uname -m)" ;;
esac

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t tradecraft)"
trap 'rm -rf "$tmp"' EXIT INT TERM

if [ -z "$version" ]; then
  # The newest tradecraft release; other crates' releases share the repository.
  fetch "https://api.github.com/repos/${REPO}/releases?per_page=100" "$tmp/releases.json"
  version="$(grep -o "\"tag_name\": *\"${TAG_PREFIX}[^\"]*\"" "$tmp/releases.json" \
    | head -n 1 | sed "s#.*\"${TAG_PREFIX}\\([^\"]*\\)\"#\\1#")"
  [ -n "$version" ] || die "found no ${TAG_PREFIX}* release; pass --version"
fi

base="${TRADECRAFT_DOWNLOAD_BASE:-https://github.com/${REPO}/releases/download}/${TAG_PREFIX}${version}"
asset="${BINARY}-${version}-${cpu}-${os}"

say "downloading ${asset}"
fetch "${base}/${asset}" "$tmp/$asset"
fetch "${base}/SHA256SUMS" "$tmp/SHA256SUMS"

want="$(awk -v f="$asset" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")"
[ -n "$want" ] || die "${asset} is not listed in SHA256SUMS"
got="$(sha256 "$tmp/$asset")"
[ "$want" = "$got" ] || die "checksum mismatch for ${asset}: expected ${want}, got ${got}"

mkdir -p "$to"
chmod 755 "$tmp/$asset"
mv "$tmp/$asset" "$to/$BINARY"
say "installed ${to}/${BINARY} (${version})"

case ":${PATH}:" in
  *":${to}:"*) ;;
  *) say "${to} is not on PATH; add it to run ${BINARY}" ;;
esac
if [ "$os" = 'apple-darwin' ]; then
  say 'the macOS binary is not signed or notarized yet; if macOS blocks it, allow it in System Settings, Privacy & Security'
fi
