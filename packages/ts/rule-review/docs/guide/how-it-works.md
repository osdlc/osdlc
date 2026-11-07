---
title: How it works
sidebar:
  order: 6
description: The steps from a changeset to findings, and the prompt the agent receives.
---

A run is six steps. Only the fifth spends money.

| Step | What happens | Code |
| --- | --- | --- |
| 1. Changeset | Find the fork point of `--base` and `HEAD`, and list every file changed since, plus uncommitted and untracked files. | `changedFiles` |
| 2. Rule sources | Ask each provider for its sources. The built-in one asks git for `CLAUDE.md` and `AGENTS.md` files and inlines their imports. | `discoverSources` |
| 3. Plan | Match each source's patterns against the changed files. A source that matches nothing is dropped. One with many files is split into shards. | `planJobs` |
| 4. Prompt | Build one agent call per job: the rules word for word, then the diff of each file the job covers. | `buildSpec` |
| 5. Judge | Run the calls, up to 32 at once, each read-only, with no saved session and a JSON schema for the answer. | `review` |
| 6. Collect | Check each answer against the schema, drop findings about files outside the job, and merge and order what is left. | `review` |

Steps 1 to 4 are free and deterministic. `--dry-run` stops after step 4.

## What the agent is asked

For a change to `src/api/users.ts` under `src/api/AGENTS.md`, the agent gets
this prompt:

````text
You are checking a changeset against one specific set of project rules.

# The rules (from src/api/AGENTS.md)

Treat the text below as the complete and only ruleset for this check.
Do not apply general best practices, style preferences, or rules from
anywhere else — another check covers those. If the text is guidance for
authoring rather than a constraint on code, apply it only where the
changed files fall under it.

<rules>
# API rules

- Every handler validates its input with zod.
</rules>

# The changed files (1)

These are the only files in scope. Each is given as a unified diff.

<file path="src/api/users.ts">
@@ -1 +1 @@
-export function getUser(req) { return db.find(req.id) }
+export function getUser(req: any) { return db.find(req.params.id) }
</file>

# What to report

Report only breaches you can point at in the diffs above. For each one,
quote the offending text in `evidence` and name the rule it breaches in
`why`. A file that complies produces no finding — an empty list is the
expected result for a clean changeset, and inventing marginal findings to
look thorough is worse than reporting none.

Severity:
- `violation` — the change contradicts a rule.
- `tension`   — defensible, but pulls against a rule's intent.
- `drift`     — complies today while moving away from a rule.

Reply with JSON matching the required schema, and nothing else.
````

The call runs read-only (`permissions: { mode: 'read-only' }`), saves no
session, and times out after 10 minutes. The answer must match
`FINDINGS_SCHEMA`: a `findings` array of `file`, optional `line`, `evidence`,
`why` and `severity`.

## Why one judgement per rule file

- **Focus.** A judge with one rule file and the few files it governs reasons
  better about each than a judge with every rule and every file.
- **Cost.** A rule file the change does not touch is never sent.
- **Attribution.** Every finding names the rule file that produced it, so a
  noisy rule is easy to find and fix.
- **Containment.** A judge that cites a file outside its job has strayed, and
  its finding is dropped.

## When a judgement fails

The agent may be missing, signed out, slow, or answer with something other than
findings. That judgement is recorded with its error, its findings are empty,
and the run is marked `degraded`. The other judgements still count: a partial
review is worth more than none. `--strict` turns a degraded run into exit 2.
