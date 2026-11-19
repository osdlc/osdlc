---
kind: source
reportedIn:
  - "[deepseek-ai deepseek-harness headless startup.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20headless%20startup.ts%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/bundle/headless/src/startup.ts#L58-L65 at 39163dd"
excerpt:
  exact: ".option('--json', 'write newline-delimited run events to stdout instead of the final message') .option('--session-id <id>', 'adopt the persisted Session with this id; an unknown id is an error') .option('--permission-mode <preset>', 'select a configured permission preset for this task, including on resume') .addOption(new Option('--approval-policy <policy>', 'set approval behavior after selecting the permission preset') .choices([...APPROVAL_POLICIES])) .option('--add-dir <path>', 'allow an additional physical absolute directory under workspace-write (repeatable)', (value: string, previous?: string[]) => [...previous ?? [], value]) .argument('[task...]', 'the task text; multiple words are joined by spaces, and `-` reads stdin')"
  prefix: "'-h, --help', 'show this help') "
  suffix: " .addHelpText('after', ` Example"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> .option('--json', 'write newline-delimited run events to stdout instead of the final message') .option('--session-id <id>', 'adopt the persisted Session with this id; an unknown id is an error') .option('--permission-mode <preset>', 'select a configured permission preset for this task, including on resume') .addOption(new Option('--approval-policy <policy>', 'set approval behavior after selecting the permission preset') .choices([...APPROVAL_POLICIES])) .option('--add-dir <path>', 'allow an additional physical absolute directory under workspace-write (repeatable)', (value: string, previous?: string[]) => [...previous ?? [], value]) .argument('[task...]', 'the task text; multiple words are joined by spaces, and `-` reads stdin')
