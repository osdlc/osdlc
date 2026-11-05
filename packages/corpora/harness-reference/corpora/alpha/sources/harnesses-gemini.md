---
title: 'gemini: harness notes for a dispatcher'
description: Model, provider and headless flags of Gemini CLI 0.46.0, read from its help text and bundle.
retrieved: 2026-10-09
---
# gemini: harness notes for a dispatcher

Source: `gemini --help` and `gemini gemma --help` of Gemini CLI 0.46.0 (Homebrew `gemini-cli`),
and a search of its installed bundle, examined 2026-10-09. The CLI could not be run against a
model here (see "Not exercised").

## Verified

| Concern | Flag or setting | Verified behaviour |
| --- | --- | --- |
| Model | `-m, --model <string>` | Model name; the bundle also reads `GEMINI_MODEL` |
| Provider | none | Google only; local Gemma runs through `gemini gemma setup\|start` (LiteRT-LM) |
| Effort | none | No flag; thinking config lives in settings (`modelConfigs`, `thinkingBudget`) |
| Context | none | No flag; settings carry a `compressionThreshold` |
| Model list | none | No list command |
| Headless | `-p, --prompt <string>` | Appended to stdin; `-o text\|json\|stream-json` |
| Prompt | `[query..]` | Positional first prompt, interactive; `-i` runs it and stays interactive |

## Not exercised

- **No live run.** Any prompt fails at sign-in: `IneligibleTierError: This client is no longer
  supported for Gemini Code Assist for individuals`, pointing at Antigravity. An API key
  (`GEMINI_API_KEY`) was not tried.
- **Thinking settings.** The bundle holds `thinkingBudget` and `thinkingLevel` defaults inside
  model configs; the settings path that overrides them per run was not traced.
