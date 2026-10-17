#!/usr/bin/env bash
# Reflow-safety gate for the sdlc /markdown-format skill.
#
# Asserts the working-tree markdown diff (vs HEAD) reflows PROSE ONLY:
# wikilinks/embeds, tables, and frontmatter keys must be untouched. This is
# the deterministic extraction of the skill's safety checks; it lives beside
# the skill and is invoked as
# ${CLAUDE_PLUGIN_ROOT}/skills/markdown-format/assess_reflow_safety.sh.
#
# Read-only: it inspects the diff and never writes. Run from the worktree
# (or repo) root after `sdlc markdown fmt`, before committing.
#
#   exit 0 + "MARKDOWN-FORMAT-SAFE"   -> diff is reflow-only, safe to commit
#   exit 1 + "MARKDOWN-FORMAT-UNSAFE" -> a rumdl regression; diagnostics on stderr
set -uo pipefail

fail=0
flag() { fail=1; printf 'UNSAFE: %s\n' "$1" >&2; }

# Strip fenced code blocks and inline-code spans so markdown that *documents*
# wikilink/regex/table syntax inside `code` is not mistaken for real content
# (a doc describing the `[[link]]` pattern must not read as a link itself).
strip_code() {
  awk '
    /^[[:space:]]*(```|~~~)/ { infence = !infence; next }
    infence { next }
    { gsub(/`[^`]*`/, ""); print }
  '
}

links() { strip_code | grep -ohE '!?\[\[[^]]+\]\]' | sort; }

changed=$(git diff --name-only -- '*.md')

# 1. Wikilink / embed multiset preserved per changed file (prose only).
if [ -n "$changed" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    before=$(git show "HEAD:$f" 2>/dev/null | links)
    if [ -f "$f" ]; then after=$(links < "$f"); else after=""; fi
    if [ "$before" != "$after" ]; then
      flag "wikilink/embed multiset changed in $f (a [[link]] or ![[embed]] was added, dropped, or rewritten):"
      diff <(printf '%s\n' "$before") <(printf '%s\n' "$after") | sed 's/^/    /' >&2
    fi
  done <<< "$changed"
fi

# 2. No table rows changed (a changed line whose content starts with a pipe).
tables=$(git diff -U0 -- '*.md' | grep -E '^[+-]\|' || true)
if [ -n "$tables" ]; then
  flag "table row(s) changed (diff lines starting with '|'):"
  printf '%s\n' "$tables" | sed 's/^/    /' >&2
fi

# 3. No frontmatter key lines changed.
fm=$(git diff -U0 -- '*.md' | grep -E '^[+-](type|schema_version|id|status):' || true)
if [ -n "$fm" ]; then
  flag "frontmatter key line(s) changed (type/schema_version/id/status):"
  printf '%s\n' "$fm" | sed 's/^/    /' >&2
fi

if [ "$fail" -ne 0 ]; then
  echo "MARKDOWN-FORMAT-UNSAFE" >&2
  exit 1
fi
echo "MARKDOWN-FORMAT-SAFE"
