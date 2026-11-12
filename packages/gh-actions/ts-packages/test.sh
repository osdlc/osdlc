#!/usr/bin/env bash
# Runs the "Refuse a package that is not on npm yet" step of
# ts-packages-release.yml, read from the workflow with yq, against small
# package trees with fake npm and pnpm programs on PATH. Needs no network.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
workflow="$here/../../../.github/workflows/ts-packages-release.yml"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
failures=0

yq '.jobs.pack.steps[] | select(.name == "Refuse a package that is not on npm yet") | .run' \
  "$workflow" > "$T/step.sh"
if ! [ -s "$T/step.sh" ]; then
  echo "FAIL could not read the step from $workflow"
  exit 1
fi

# npm view <name> succeeds unless the name starts with @new/.
mkdir -p "$T/bin"
cat > "$T/bin/npm" <<'FAKE'
#!/usr/bin/env bash
case "$2" in
  @new/*) echo "npm error code E404" >&2; exit 1 ;;
  *) echo "$2" ;;
esac
FAKE
# pnpm exec package-checks config tsDir prints packages/ts.
cat > "$T/bin/pnpm" <<'FAKE'
#!/usr/bin/env bash
[ "$*" = "exec package-checks config tsDir" ] && echo packages/ts
FAKE
chmod +x "$T/bin/npm" "$T/bin/pnpm"

# tree <dir> <folder>=<name>...
tree() {
  local dir="$1" spec
  shift
  rm -rf "$dir"
  mkdir -p "$dir"
  for spec in "$@"; do
    mkdir -p "$dir/${spec%%=*}"
    printf '{ "name": "%s" }\n' "${spec#*=}" > "$dir/${spec%%=*}/package.json"
  done
}

# check <name> <want exit> <want text> <dir> <ts-checks> <package-globs>
check() {
  local name="$1" want_status="$2" want_text="$3" dir="$4" status=0 out
  out="$(cd "$dir" && PATH="$T/bin:$PATH" TS_CHECKS="$5" PACKAGE_GLOBS="$6" \
    bash --noprofile --norc -eo pipefail "$T/step.sh" 2>&1)" || status=$?
  if [ "$status" -eq "$want_status" ] && grep -qF -- "$want_text" <<<"$out"; then
    echo "ok   $name"
  else
    echo "FAIL $name: want exit $want_status and \"$want_text\", got exit $status:"
    printf '     %s\n' "$out"
    failures=$((failures + 1))
  fi
}

tree "$T/models" profiles/claims=@osdlc/claims profiles/sdlc=@osdlc/sdlc corpora/starter=@osdlc/starter
tree "$T/unstaged" profiles/claims=@osdlc/claims corpora/starter=@new/starter
tree "$T/ts" packages/ts/lib=@osdlc/lib
tree "$T/ts-unstaged" packages/ts/lib=@osdlc/lib packages/ts/new=@new/lib

check "every package on npm" 0 "" "$T/models" false "profiles/* corpora/*"
check "space-separated globs reach every entry" 1 "@new/starter is not on npm yet" \
  "$T/unstaged" false "profiles/* corpora/*"
check "newline-separated globs reach every entry" 1 "@new/starter is not on npm yet" \
  "$T/unstaged" false $'profiles/*\ncorpora/*\n'
check "a misspelt entry with a wildcard" 1 "the package-globs entry profle/* matches no package folder" \
  "$T/models" false "profle/* corpora/*"
check "a misspelt entry without a wildcard" 1 "the package-globs entry profiles/clams matches no package folder" \
  "$T/models" false "profiles/clams corpora/*"
check "a blank package-globs" 1 "package-globs is set but names no folder" \
  "$T/models" false "   "
check "ts-checks false without package-globs" 1 "ts-checks: false needs package-globs" \
  "$T/models" false ""
check "the default reads tsDir" 0 "" "$T/ts" true ""
check "the default refuses a package not on npm" 1 "@new/lib is not on npm yet" \
  "$T/ts-unstaged" true ""
check "an empty tsDir" 1 "no packages in packages/ts" "$T/models" true ""

if [ "$failures" -ne 0 ]; then
  echo "$failures failed"
  exit 1
fi
echo "all passed"
