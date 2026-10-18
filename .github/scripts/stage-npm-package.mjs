// Stages a new library on npm so CI can publish it: publishes the
// `0.0.1-stage` placeholder by hand, then opens the package's npm settings
// with the trusted publisher values to enter. npm can only set up trusted
// publishing on a package that already exists (see packages/README.md,
// "Publishing a new library for the first time").
//
//   node .github/scripts/stage-npm-package.mjs [--dry-run] [--no-open] <package> ...
//
// Each <package> is a package directory (packages/ts/<name>), which gives the
// name and licence, or a bare name such as @osdlc/color. A package already on
// npm is not published again; its settings still open. Run it logged in to npm
// as an owner of the @osdlc scope. npm asks for a one-time password or a
// browser login when the account needs one.
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PLACEHOLDER = "0.0.1-stage";
const REPO = "osdlc/osdlc";
const WORKFLOW = "packages-publish.yml";
const DEFAULT_LICENSE = "MIT OR Apache-2.0";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const open = !args.includes("--no-open") && process.platform === "darwin";
const targets = args.filter((a) => !a.startsWith("--"));
if (targets.length === 0) {
  console.error(
    "usage: node .github/scripts/stage-npm-package.mjs [--dry-run] [--no-open] <package> ...",
  );
  process.exit(2);
}

/** Name and licence from a package directory, or a bare name with the default licence. */
function resolveTarget(arg) {
  const manifest = join(arg, "package.json");
  if (existsSync(manifest)) {
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    return { name: pkg.name, license: pkg.license ?? DEFAULT_LICENSE };
  }
  if (arg.startsWith("@")) return { name: arg, license: DEFAULT_LICENSE };
  throw new Error(
    `${arg}: neither a package directory nor a scoped package name`,
  );
}

/** True when the registry already has any version of the package. */
function onNpm(name) {
  const r = spawnSync("npm", ["view", name, "name"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() === name;
}

// A dry run needs no login, so it can be tried before `npm login`.
let user = "(not logged in)";
try {
  user = execFileSync("npm", ["whoami"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  if (!dryRun) {
    console.error("Not logged in to npm. Run `npm login` first.");
    process.exit(1);
  }
}
console.log(
  `npm user: ${user}${dryRun ? " (dry run: nothing is published)" : ""}\n`,
);

let failed = false;
for (const arg of targets) {
  const { name, license } = resolveTarget(arg);
  if (onNpm(name)) {
    console.log(`${name}: already on npm, not publishing a placeholder.`);
  } else {
    const dir = mkdtempSync(join(tmpdir(), "stage-npm-package-"));
    try {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(
          {
            name,
            version: PLACEHOLDER,
            description: `Placeholder so npm can set up trusted publishing. Releases come from ${REPO}.`,
            license,
            repository: {
              type: "git",
              url: `git+https://github.com/${REPO}.git`,
            },
          },
          null,
          2,
        ) + "\n",
      );
      writeFileSync(
        join(dir, "README.md"),
        `# ${name}\n\nPlaceholder version. The first real release is published from https://github.com/${REPO}.\n`,
      );
      const publish = [
        "publish",
        "--access",
        "public",
        "--tag",
        "stage",
        ...(dryRun ? ["--dry-run"] : []),
      ];
      console.log(`${name}: npm ${publish.join(" ")}`);
      const r = spawnSync("npm", publish, { cwd: dir, stdio: "inherit" });
      if (r.status !== 0) {
        console.error(`${name}: publish failed; not opening its settings.\n`);
        failed = true;
        continue;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const url = `https://www.npmjs.com/package/${name}/access`;
  console.log(`
${name}: add the trusted publisher at ${url}
  Settings > Trusted publisher > GitHub Actions
    Organization or user: ${REPO.split("/")[0]}
    Repository:           ${REPO.split("/")[1]}
    Workflow filename:    ${WORKFLOW}
    Environment:          (leave empty; the publish job uses none)
`);
  if (open && !dryRun) spawnSync("open", [url], { stdio: "ignore" });
}
process.exit(failed ? 1 : 0);
