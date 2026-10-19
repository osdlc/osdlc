// A corpus config for the CLI tests: decision files go to a decision contract and task files
// to a task contract, both built with the contract builders and zod. Each has a frontmatter
// schema and a required section sequence, so a malformed document gives both a
// frontmatter-enum finding and a missing-section finding.
//
// It imports the package by name, which resolves to the built dist/: the CLI loads this file
// with a real Node `import()`, which cannot load the TypeScript source. The test setup builds
// dist/ first.
//
// The globs match a file name prefix anywhere in the tree (`**/D-*.md`, `**/T-*.md`), so they
// hold whether a run covers the whole corpus or one subfolder.
import { contract, defineConfig, section, sections } from "@osdlc/markdown-contract";
import { z } from "zod";

const decisionFrontmatter = z.strictObject({
  id: z.string().regex(/^D-[0-9]{4}$/),
  status: z.enum(["open/proposed", "open/accepted", "closed/superseded"]),
  title: z.string().min(1),
});

const taskFrontmatter = z.strictObject({
  id: z.string().regex(/^T-[0-9]{4}$/),
  status: z.enum(["open/ready", "in-progress/active", "closed/done"]),
  title: z.string().min(1),
});

const decisionContract = contract({
  frontmatter: decisionFrontmatter,
  body: sections({ allowUnknown: true }, [section("Context"), section("Decision")]),
});

const taskContract = contract({
  frontmatter: taskFrontmatter,
  body: sections({ allowUnknown: true }, [section("Goal"), section("Approach")]),
});

export default defineConfig({
  rules: [
    { include: ["**/D-*.md", "D-*.md"], contract: decisionContract },
    { include: ["**/T-*.md", "T-*.md"], contract: taskContract },
  ],
});
