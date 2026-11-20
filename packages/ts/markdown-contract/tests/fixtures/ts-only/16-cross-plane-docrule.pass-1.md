---
id: T-AB12
status: closed/done
title: Wire up the projection cache
---

## Goal

Cache the layer-1 projection so re-validation skips re-parsing.

## Post-mortem

### Acceptance criteria coverage

All three ACs met; cache keyed on source hash.

### What worked

The projection was already positioned, so the cache key fell out for free.

### Friction and automation gaps

None worth filing.