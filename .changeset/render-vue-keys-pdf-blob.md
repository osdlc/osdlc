---
"@osdlc/markdown-render-vue": patch
---

Export `NoteSourceKey` and `EmbedAncestorsKey` again, for a host that provides the note source app-wide or injects the embed chain outside `setup`. A PDF embed's `href` now takes the asset URL check, so a host that serves attachments as `blob:` URLs gets a working PDF link again; other links still refuse `blob:`.
