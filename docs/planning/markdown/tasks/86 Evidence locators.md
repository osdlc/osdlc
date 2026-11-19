---
number: 86
title: Evidence locators
detail: harness-reference
status: todo
type: functional
milestone: "[m-evidence](../milestones/m-evidence.md)"
---

Make every study result in the harness reference lead a reader to the exact source.

A study result says what a document said or a run found. Many say too little to check. Of 1,189
study results, 116 name no source document in `reportedIn`, and at most 854 have a `locator` (where
in the source) or an `excerpt` (the words quoted). A reader who follows the link lands on a page
and has to find the line.

What to do:

- Count the gaps by `kind`: no `reportedIn`, no `locator`, no `excerpt`. A run or an inference may
  rightly have no document; say which kinds must have which fields.
- Put that rule in the study-results schema, so the validator reports a new result that breaks it.
- Fill the gaps: open each source, find the passage, and record the locator and the excerpt. Mark a
  result whose source no longer says it, so its statement can be reviewed.
- Check each document's URL and set `url_status`.

Done when every study result of a kind that needs a source has `reportedIn`, a locator and an
excerpt, and the validator enforces it.

The steps are the first use of [87 Knowledge plugin](87%20Knowledge%20plugin.md): write them as a
skill, then run the skill on this corpus.
