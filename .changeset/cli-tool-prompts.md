---
'@osdlc/cli-tool': minor
---

Prompts for text and for one of a list, a way to require a person, and a way to ask on the terminal when stdin is a pipe (all experimental). `askText(question, { default })` reads a line. `askChoice(question, choices, { default })` prints a numbered list, takes a number or the text, and asks again on a bad answer. `required: true` on any prompt (including `askYesNo`) throws `NotInteractiveError` instead of letting piped input or end of input answer, and `flag` names the flag that answers instead. `runMain` and a command tree's `run` print that error and exit 2 when there was no terminal (1 when input ended); under `--json` its code is `not-interactive`. `openTty()` returns stdin and stderr when both are terminals, else opens `/dev/tty`, else `null`; `requireInteractive()` throws instead of returning `null`.
