---
type: Harness Fact
title: "Claude Code: Skills in context at startup"
description: "Skills in context at startup in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/startup-context
observations:
  - value: {"listed": "name and description of each skill", "every_name_listed": true, "budget": "1% of the model context window", "over_budget": "descriptions dropped, least-invoked skills first"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Troubleshooting, Skill descriptions are cut short"
    evidence: docs
  - value: {"per_entry_cap_chars": "1536", "cap_covers": "description plus when_to_use", "configurable_by": "skillListingMaxDescChars setting; budget by skillListingBudgetFraction setting or SLASH_COMMAND_TOOL_CHAR_BUDGET"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Troubleshooting, Skill descriptions are cut short"
    evidence: docs
  - value: {"name_only_option": "skillOverrides set to name-only lists a skill without its description"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Troubleshooting, Skill descriptions are cut short"
    evidence: docs
sources:
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Claude Code](/harnesses/claude-code.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name and description of each skill; every name listed: yes; budget: 1% of the model context window; over budget: descriptions dropped, least-invoked skills first.[^claude-code-skills]

  > The listing always contains every skill name, but if you have many skills, Claude Code drops some descriptions to fit the listing's character budget [...] The budget scales at 1% of the model's context window.
- 2026-11-04: per entry cap chars: 1536; cap covers: description plus when_to_use; configurable by: skillListingMaxDescChars setting; budget by skillListingBudgetFraction setting or SLASH_COMMAND_TOOL_CHAR_BUDGET.[^claude-code-skills]

  > each entry's combined text is capped at 1,536 characters regardless of budget. The cap is configurable with skillListingMaxDescChars.
- 2026-11-04: name only option: skillOverrides set to name-only lists a skill without its description.[^claude-code-skills]

  > set low-priority entries to "name-only" in skillOverrides so they list without a description.

[^claude-code-skills]: Claude Code docs: skills
