---
'@osdlc/typed-git': minor
---

`diffText`, `diffAddedFile` and `diffNameStatus` no longer follow the user's diff configuration, and never read a rev as a path.

- `diffText` and `diffAddedFile` always pass `--no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/ --no-relative`. Their text is a plain unified diff with `a/` and `b/` prefixes whatever `color.ui`, `color.diff`, `diff.external`, a `diff.<driver>.command` or textconv driver, `diff.noprefix`, `diff.mnemonicPrefix`, `diff.srcPrefix`, `diff.dstPrefix` and `diff.relative` say, so `git apply` takes it. These are the two verbs whose output changes under a colour setting.
- `diffNameStatus` always passes `--no-color --no-relative`. `--no-color` is a guard: git never coloured that output. `--no-relative` changes the rows only under `diff.relative=true` with a cwd below the repository root, where the paths are now relative to the root and changes outside the cwd are listed.
- `diffText` and `diffNameStatus` pass `--` after the rev or range, with or without paths. A rev that names a file but no revision now throws, where it returned that file's diff. A branch that shares its name with a file or folder now works, where git refused it as ambiguous.
- `diffStat`, `diffCheck`, `log` with no `format`, `logLines` and `grep` without `noColor` still follow the user's colour setting. The README's new "Diff output and the user's git configuration" section lists them.
- **Breaking for fake runners:** the argv of three verbs changed, so a `CommandRunner` keyed on the old argv no longer matches and gives its default reply. To migrate, key the fake on the new argv:
  - `diffText`: `diff --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/ --no-relative [--cached] [--binary] [rev --] [-- paths]`. It was `diff [--cached] [--binary] [rev] [-- paths]`. The six flags follow `diff`, and `--` follows a rev even with no paths.
  - `diffAddedFile`: `diff --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/ --no-relative --no-index -- /dev/null <path>`. It was `diff --no-index -- /dev/null <path>`.
  - `diffNameStatus`: `diff --no-color --no-relative --name-status -z [--cached] [--no-renames] [range --] [-- paths]`. It was `diff --name-status -z [--cached] [--no-renames] [range] [-- paths]`. The two flags follow `diff`, and `--` follows a range even with no paths.
