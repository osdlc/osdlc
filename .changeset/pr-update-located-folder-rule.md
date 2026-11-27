---
"@osdlc/pr-update": patch
---

A located checkout is used only when its work tree, git directory and
`config` file belong to you and others cannot write to them, the rule the
clone directory already follows. Its git config runs as you on every fetch
and push, so a checkout anyone could have put in place (under `/tmp`, say) is
skipped with a note naming the fix, and is not read by the `unpushed_local`
guard either. Writable by the group counts too, unless the group is your
private group, which is never so on macOS: a checkout made under umask 002 on
macOS is now skipped until you run `chmod go-w` on what the note names.
