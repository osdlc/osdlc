/**
 * The bash launcher a tool commits, rendered from its spec.
 *
 * A launcher on PATH runs before any JavaScript runtime is chosen. The
 * canonical install may be a compiled binary, and the linked checkout runs
 * under Bun. So the resolution checks in `resolve.ts` are written again here
 * in bash. The template is the single source. A tool renders it into its repo,
 * and a test checks that the committed file still matches (`launcherDrift`).
 *
 * The config directory is inlined for the same reason: the launcher cannot
 * call TypeScript code. It matches `@osdlc/tiered-dirs`' `config` home under
 * the `xdg` convention, including the vendor's `<P>_CONFIG_DIR` and `<P>_ROOT`
 * overrides. The launcher does not run on Windows.
 *
 * The `local` case: when rendered with `{ builtEntry }` (a path relative to
 * the checkout root), that file runs under Node when present, else the source
 * entry runs under Bun. A dev checkout (installed with `node_modules`, and
 * with Bun on PATH) skips the built entry, so a committed bundle never hides
 * the source being edited. This is the canonical-install shape for a tool
 * that ships built JavaScript. A tool whose canonical install is elsewhere
 * (an npm shim) points `install` at that shim instead and never renders this.
 */

import { readFileSync, realpathSync } from 'node:fs'
import { dirname, posix, relative, resolve as resolvePath } from 'node:path'

import { cwdDevVar, entryOf, homeVar, launchLayerVar, quietVar, type ToolSpec } from './spec.ts'

/**
 * Options for the launcher script, such as a built entry to prefer under Node.
 * @experimental
 */
export interface LauncherOptions {
  /**
   * A built sibling entry to prefer under Node, relative to the checkout
   * root. For example `dist/cli.js`. Omit for a source-only tool.
   */
  builtEntry?: string
}

/**
 * Bun reads `.env*` and `bunfig.toml` from the cwd, which can be a repository
 * the user does not control. These flags stop both; `bunRunArgs` in
 * `exec.ts` explains why.
 */
const BUN_FLAGS = '--no-env-file --config=/dev/null'

/**
 * Prints the keys of a package.json `dependencies` object, one per line.
 * Handles the block opening, holding entries, and closing on one line or
 * several: each segment is split on commas and its first quoted string is the
 * name. Stops at the closing brace so `devDependencies` is never read.
 */
const AWK_DEPS = [
  'function emit(s,  n,a,i){n=split(s,a,","); for(i=1;i<=n;i++) if(match(a[i],/"[^"]+"/)) print substr(a[i],RSTART+1,RLENGTH-2)}',
  '/"dependencies"[[:space:]]*:/ && !f {s=$0; sub(/^.*"dependencies"[[:space:]]*:[[:space:]]*[{]/,"",s); if((i=index(s,"}"))>0){emit(substr(s,1,i-1)); exit} emit(s); f=1; next}',
  'f {if((i=index($0,"}"))>0){emit(substr($0,1,i-1)); exit} emit($0)}',
].join(' ')

/**
 * The checkout root a launcher at `launcherPath` belongs to: the launcher's
 * real directory, up the same number of `..` steps the rendered launcher uses
 * for `self` (`spec.launcher`'s depth). This is the `self` to pass to `resolve` to learn
 * what that launcher would run. Null when the launcher cannot be resolved.
 * @experimental
 */
export function launcherCheckout(spec: ToolSpec, launcherPath: string): string | null {
  const launcherDir = posix.dirname(spec.launcher)
  const hops = launcherDir === '.' ? 0 : launcherDir.split('/').length
  try {
    return resolvePath(dirname(realpathSync(launcherPath)), ...Array<string>(hops).fill('..'))
  } catch {
    return null
  }
}

/**
 * Produce the text of the launcher script for a tool. Throws when the spec
 * sets `packageName`, which the bash checks cannot read.
 * @experimental
 */
export function renderLauncher(spec: ToolSpec, opts: LauncherOptions = {}): string {
  if (spec.packageName !== undefined) {
    throw new Error(
      'devlink: renderLauncher cannot check packageName in bash; use a JavaScript launcher that calls execSelection',
    )
  }
  const name = spec.name
  const cwdLayer = spec.cwdLayer === true
  const marker = spec.marker
  const entry = entryOf(spec)
  const launcherDir = posix.dirname(spec.launcher)
  // From the launcher's directory back to the checkout root, as `..` steps.
  const hops = launcherDir === '.' ? 0 : launcherDir.split('/').length
  const rootFromHere = hops === 0 ? '$here' : `$here/${Array(hops).fill('..').join('/')}`
  const suppressors = spec.suppressors ?? []
  const suppressorGuard = suppressors.map((v) => `[ -z "\${${v}+x}" ]`).join(' && ')
  const guard = suppressorGuard.length > 0 ? ` && ${suppressorGuard}` : ''
  const built = opts.builtEntry
  const layerVar = launchLayerVar(spec)
  const configVar = spec.vendorDirs.envVars.dirs.config
  const rootVar = spec.vendorDirs.envVars.root
  for (const v of [configVar, rootVar]) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) {
      throw new Error(
        `devlink: renderLauncher needs a shell variable name, got ${JSON.stringify(v)}`,
      )
    }
  }

  const lines: string[] = []
  const p = (s = ''): void => {
    lines.push(s)
  }
  p('#!/usr/bin/env bash')
  p(`# ${name} — launcher. GENERATED by @osdlc/cli-tool/devlink from this tool's spec;`)
  p('# regenerate rather than edit (the drift test compares the two).')
  p('#')
  p('# Picks which checkout answers, in this order:')
  if (cwdLayer) {
    p(`#   ${homeVar(spec)} env → checkout above cwd → linked checkout → local.`)
    p('# Explicit env always applies. The cwd and link layers are off when a')
    if (suppressors.length > 0) {
      p(`# suppressor is set (${suppressors.join(', ')}) — a harness that invokes this`)
      p('# launcher must never have its code silently swapped — and the cwd layer')
      p(`# alone is off under ${cwdDevVar(spec)}=0. \`${name} dev\` manages the link.`)
    } else {
      p(`# cwd layer is off under ${cwdDevVar(spec)}=0. \`${name} dev\` manages the link.`)
    }
  } else {
    p(`#   ${homeVar(spec)} env → linked checkout → local.`)
    if (suppressors.length > 0) {
      p('# Explicit env always applies. The link layer is off when a suppressor is')
      p(`# set (${suppressors.join(', ')}) — a harness that invokes this launcher must`)
      p(`# never have its code silently swapped. \`${name} dev\` manages the link.`)
    } else {
      p(`# Explicit env always applies. \`${name} dev\` manages the link.`)
    }
  }
  p('#')
  p('# When a layer hands off to another checkout, says which entry runs, and why,')
  p(
    `# on stderr before anything else. The local copy runs silently. ${quietVar(spec)}=1 silences it.`,
  )
  p('set -euo pipefail')
  p()
  p('# Resolve THIS file through any symlink chain:')
  p('# `here` must be the directory the real launcher sits in.')
  p('src="${BASH_SOURCE[0]}"')
  p('while [ -L "$src" ]; do')
  p('  dir="$(cd -P "$(dirname "$src")" && pwd)"')
  p('  src="$(readlink "$src")"')
  p('  case "$src" in /*) ;; *) src="$dir/$src" ;; esac')
  p('done')
  p('here="$(cd -P "$(dirname "$src")" && pwd)"')
  p(`self="$(cd -P "${rootFromHere}" && pwd)"`)
  p()
  p('announce() {')
  p(`  [ "\${${quietVar(spec)}:-0}" = "1" ] || echo "${name}: running $1 ($2)" >&2`)
  p('}')
  p()
  p('# Prints the path of $1 on the absolute PATH entries, as execSelection finds')
  p('# bun. A relative or empty entry is searched from the cwd, which can be a')
  p('# repository, so it is skipped. Git Bash, MSYS and Cygwin give PATH in')
  p('# /c/x form with ":" between entries, so a drive form cannot appear.')
  p('find_abs() {')
  p('  local rest="${PATH:-}" dir')
  p('  while [ -n "$rest" ]; do')
  p('    dir="${rest%%:*}"')
  p('    case "$rest" in *:*) rest="${rest#*:}" ;; *) rest="" ;; esac')
  p('    case "$dir" in')
  p('      /*) if [ -f "$dir/$1" ] && [ -x "$dir/$1" ]; then echo "$dir/$1"; return 0; fi ;;')
  p('    esac')
  p('  done')
  p('  return 1')
  p('}')
  p()
  p('is_checkout() {')
  p(`  [ -n "$1" ] && [ -d "$1" ] && [ -f "$1/${marker}" ]`)
  p('}')
  p()
  p("# Source under Bun resolves imports from the checkout's own node_modules; a fresh")
  p('# worktree has none, and a fast-forward that adds a dependency leaves it one')
  p('# package short. Either way the first import would fail far from the cause, so')
  p('# name the checkout and the fix up front. $1 is the checkout, $2 the entry; the')
  p('# packages checked are the `dependencies` of every package.json from the entry up')
  p('# to the checkout, each looked up the')
  p('# way Bun walks node_modules, stopping at the checkout (or at a filesystem')
  p('# root, so a non-ancestor checkout path cannot loop).')
  p('need_deps() {')
  p('  if [ -f "$1/package.json" ] && [ ! -d "$1/node_modules" ]; then')
  p(`    echo "${name}: $1 has no node_modules. Run 'bun install' there." >&2`)
  p('    exit 1')
  p('  fi')
  p('  local pkg dep d up')
  p('  pkg="$(dirname "$2")"')
  p('  while :; do')
  p('    if [ -f "$pkg/package.json" ]; then')
  p(`      for dep in $(awk '${AWK_DEPS}' "$pkg/package.json"); do`)
  p('        d="$pkg"')
  p('        while :; do')
  p('          [ -e "$d/node_modules/$dep" ] && continue 2')
  p('          [ "$d" = "$1" ] && break')
  p('          up="$(dirname "$d")"')
  p('          [ "$up" = "$d" ] && break')
  p('          d="$up"')
  p('        done')
  p(`        echo "${name}: $1 is missing package '$dep'. Run 'bun install' there." >&2`)
  p('        exit 1')
  p('      done')
  p('    fi')
  p('    [ "$pkg" = "$1" ] && break')
  p('    up="$(dirname "$pkg")"')
  p('    [ "$up" = "$pkg" ] && break')
  p('    pkg="$up"')
  p('  done')
  p('}')
  p()
  p('home=""')
  p('via=""')
  p('layer="local"')
  p()
  p(`# ── env: ${homeVar(spec)} ───────────────────────────────────────────────`)
  p('# Only an absolute path counts, as in resolve(). A drive path counts only')
  p('# under Windows (Git Bash, MSYS, Cygwin); elsewhere it is relative.')
  p('abs=0')
  p(`case "\${${homeVar(spec)}:-}" in`)
  p('  /*) abs=1 ;;')
  p('  [A-Za-z]:[/\\\\]*) case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) abs=1 ;; esac ;;')
  p('esac')
  p(`if [ "$abs" = "1" ] && is_checkout "\${${homeVar(spec)}}"; then`)
  p(`  home="\${${homeVar(spec)}}"; via="${homeVar(spec)}"; layer="env"`)
  p('fi')
  p()
  if (cwdLayer) {
    p('# ── cwd: a checkout above the working directory ─────────────────────────')
    p('# Walks the physical directory (`pwd -P`), as resolve() walks process.cwd().')
    p(`if [ -z "$home" ]${guard} && [ "\${${cwdDevVar(spec)}:-1}" != "0" ]; then`)
    p('  probe="$(pwd -P)"')
    p('  while :; do')
    p(
      '    if is_checkout "$probe"; then home="$probe"; via="dev checkout above cwd"; layer="cwd"; break; fi',
    )
    p('    parent="$(dirname "$probe")"')
    p('    [ "$parent" = "$probe" ] && break')
    p('    probe="$parent"')
    p('  done')
    p('fi')
    p()
  }
  p('# ── link: `<config>/' + name + '/home`, written by `' + name + ' dev link|use` ─────')
  p('# Mirrors @osdlc/tiered-dirs standalone("' + name + '").config(): the launcher runs')
  p('# before a runtime exists, so it cannot call the SDK. A HOME that is unset or')
  p("# relative counts as unset, and the account's home is used, as there. With no")
  p('# usable home the layer is skipped.')
  p(`if [ -z "$home" ]${guard}; then`)
  p('  user_home="${HOME:-}"')
  p('  case "$user_home" in')
  p('    /*) ;;')
  p('    *)')
  p('      user_home=""')
  p('      u="$(id -un 2>/dev/null || true)"')
  p('      # A plain account name only, since it goes through eval for ~name.')
  p('      case "$u" in ""|-*|*[!A-Za-z0-9._-]*) ;; *) eval "user_home=~$u" ;; esac')
  p('      case "$user_home" in /*) ;; *) user_home="" ;; esac ;;')
  p('  esac')
  p('  cfg=""')
  p(`  # ${configVar}, then ${rootVar}/config, then the xdg convention, as in`)
  p('  # @osdlc/tiered-dirs. A relative override is an error there, so it reads')
  p('  # nothing here. Only an absolute XDG_CONFIG_HOME counts.')
  p(`  case "\${${configVar}:-}" in`)
  p(`    /*) cfg="$${configVar}/${name}" ;;`)
  p('    "")')
  p(`      case "\${${rootVar}:-}" in`)
  p(`        /*) cfg="$${rootVar}/config/${name}" ;;`)
  p('        "")')
  p('          case "${XDG_CONFIG_HOME:-}" in')
  p(`            /*) cfg="$XDG_CONFIG_HOME/${name}" ;;`)
  p(`            *) [ -z "$user_home" ] || cfg="$user_home/.config/${name}" ;;`)
  p('          esac ;;')
  p('      esac ;;')
  p('  esac')
  p('  linked=""')
  p('  [ -z "$cfg" ] || linked="$(cat "$cfg/home" 2>/dev/null || true)"')
  p(
    '  if is_checkout "$linked"; then home="$linked"; via="linked checkout: $cfg/home"; layer="link"; fi',
  )
  p('fi')
  p()
  p('# ── a selected checkout other than this one runs its source under Bun ──')
  p('if [ -n "$home" ]; then')
  p('  home_real="$(cd -P "$home" && pwd)"')
  p('  if [ "$home_real" != "$self" ]; then')
  p('    if ! bun="$(find_abs bun)"; then')
  p(
    `      echo "${name}: the selected checkout ($home_real) runs from source and needs bun on an absolute PATH entry." >&2`,
  )
  p(
    `      echo "      Install Bun (https://bun.sh), or run '${name} dev off' to use the local install." >&2`,
  )
  p('      exit 1')
  p('    fi')
  p(`    need_deps "$home_real" "$home_real/${entry}"`)
  p(`    announce "$home_real/${entry}" "$via"`)
  p(`    export ${layerVar}="$layer"`)
  p(`    exec "$bun" ${BUN_FLAGS} run "$home_real/${entry}" "$@"`)
  p('  fi')
  p(
    "  # The selected checkout is this launcher's own: it reads as the install, not as a dev selection.",
  )
  p('  layer="local"')
  p('fi')
  p()
  p('# ── local: what sits beside this launcher ───────────────────────────────')
  if (built !== undefined) {
    const builtRel = posix.relative(launcherDir === '.' ? '' : launcherDir, built)
    // `node_modules` is the sign. A plugin harness's clone of the repo has the
    // source but was never installed, so it uses the built entry.
    p('# A dev checkout (installed, with bun) runs its source, so a committed')
    p('# built entry never shadows the code being edited. Anything else — an')
    p('# install, or an uninstalled clone — runs the built entry.')
    p('dev_checkout=0')
    p(
      'if is_checkout "$self" && [ -d "$self/node_modules" ] && find_abs bun >/dev/null; then dev_checkout=1; fi',
    )
    p(`if [ "$dev_checkout" = "0" ] && [ -f "$here/${builtRel}" ]; then`)
    p('  if ! node="$(find_abs node)"; then')
    p(
      `    echo "${name}: the built entry '${posix.basename(built)}' is present but 'node' is not on an absolute PATH entry." >&2`,
    )
    p('    exit 1')
    p('  fi')
    p(`  export ${layerVar}="$layer"`)
    p(`  exec "$node" "$here/${builtRel}" "$@"`)
    p('fi')
  }
  p('if ! bun="$(find_abs bun)"; then')
  p(
    `  echo "${name}: the source entry needs bun on an absolute PATH entry. Install Bun (https://bun.sh)." >&2`,
  )
  p('  exit 1')
  p('fi')
  p(`need_deps "$self" "$self/${entry}"`)
  p(`export ${layerVar}="$layer"`)
  p(`exec "$bun" ${BUN_FLAGS} run "$self/${entry}" "$@"`)
  return lines.join('\n') + '\n'
}

/**
 * The committed launcher versus a fresh render: null when identical, else a
 * one-line description for a test assertion or a check.
 * @experimental
 */
export function launcherDrift(
  spec: ToolSpec,
  checkout: string,
  opts: LauncherOptions = {},
): string | null {
  const path = posix.join(checkout, spec.launcher)
  let actual: string
  try {
    actual = readFileSync(path, 'utf-8')
  } catch {
    return `launcher missing at ${path}`
  }
  const expected = renderLauncher(spec, opts)
  if (actual === expected) return null
  const rel = relative(dirname(checkout), path)
  return `${rel} differs from renderLauncher(spec) — regenerate it`
}
