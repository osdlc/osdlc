---
"@osdlc/markdown-render-vue": patch
---

Export `NoteSourceKey` and `EmbedAncestorsKey` again, for a host that provides the note source app-wide or injects the embed chain outside `setup`. A PDF embed's `href` takes the asset URL check again, so a host that serves attachments as `blob:` URLs gets a working PDF link; every other link, note-authored ones included, still refuses `blob:`.
