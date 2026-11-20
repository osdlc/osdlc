---
id: T-AB12
status: closed/done
title: Wire up the export button
---

# Wire up the export button

## Goal

Let users export the current view as CSV.

## Acceptance criteria

- [x] Export button appears in the toolbar
- [x] Clicking it downloads a CSV of the current rows

## Post-mortem

### Acceptance criteria coverage

Both criteria verified against the staging dataset.

### What worked

The existing CSV serializer dropped in cleanly.

### Friction and automation gaps

None of note.