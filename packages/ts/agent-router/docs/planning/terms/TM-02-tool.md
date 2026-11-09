---
id: TM-02
type: term
state: accepted
created: 2026-11-07
---

# TM-02: Tool

## Definition

A program the [agent router](TM-01-agent-router.md) can launch to do work. The shipped catalogue's
tools are the coding-agent CLIs `claude`, `codex`, `cursor`, `antigravity`, `pi` and `opencode`; a
config layer can declare more. A tool is the first part of a [reference](TM-04-reference.md)
(`codex` in `codex/max@high`).

## Contrast

Not the model. A tool runs a model; one tool can run many models, and one model can be run by
several tools.

Not the [provider](TM-03-provider.md). The provider serves the model; the tool is the program that
calls it.

## Notes

A tool's id matches `TOOL_ID_PATTERN`. A built-in tool runs as the snapshot names its binary; a
tool a config declares runs as its id.
