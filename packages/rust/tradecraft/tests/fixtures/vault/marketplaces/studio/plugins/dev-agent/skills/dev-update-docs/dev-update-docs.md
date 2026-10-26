---
name: dev-update-docs
description: |-
  Refresh a project's documentation site against its source. Regenerates the
  generated pages, checks the hand-written pages for statements the source
  no longer supports, fixes what it can, then builds the site to confirm
  nothing broke. Reports one summary with the regeneration, drift and build
  status.
allowed-tools:
- Bash
- Read
- Edit
- Glob
- Grep
- AskUserQuestion
tc-kind: skill
tc-plugin: dev-agent
---

# /[[dev-update-docs]]

Usage:

- /[[dev-update-docs]] — run the full refresh end to end.

## 1. Regenerate

Run the project's documentation generator. Note every page it added,
changed or removed.

## 2. Check the hand-written pages

Read each hand-written page. For each command, file path or option it
names, confirm the source still has it. List each statement that no longer
holds, with the page and line.

## 3. Fix

Fix each statement whose correct form is clear from the source. Leave the
others in the report for a person to decide.

## 4. Build

Build the site. A build error fails the run.

## Report

One summary: pages regenerated, drift found and fixed, drift left, and the
build result.
