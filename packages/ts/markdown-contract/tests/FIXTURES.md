# Fixture-driven tests

The suites at the top of `tests/` run the whole engine. Unit tests sit in folders under
`tests/` that mirror `src/`, such as `tests/core/`.

## Layout

| Path | Role |
|---|---|
| `tests/harness.ts` | The fixture types and the runners. |
| `tests/fixtures/validation/*.ts` | One validation fixture per file: a contract plus its cases. |
| `tests/fixtures/consumption/*.ts` | One consumption fixture per file: a document plus typed-model reads. |
| `tests/fixtures/consumption/*.md`, `*.contract.yaml` | The consumption documents and their YAML contracts. |
| `tests/fixtures/infer/NN-name/` | Inference fixtures: a small markdown folder plus assertions. |
| `tests/fixtures/migrate/` | Old `mcVersion: 1` contracts, used to test `markdown-contract migrate`. |
| `tests/fixtures/corpus/` | A small folder of documents and a config, used by the CLI tests. |
| `tests/fixtures/projection/` | A real document used by the parser tests. |
| `../../../conformance/markdown-contract/suite.json` | The shared validation corpus: the cases of the conformance suite, each with a YAML contract, a document and the expected findings. |
| `tests/fixtures/ts-only/` | The documents, expected findings and YAML contracts of the fixtures that need code (custom rules), which the suite leaves out. |
| `tests/validation.test.ts`, `tests/consumption.test.ts`, `tests/inference.test.ts` | Feed the fixtures to the runners. |
| `tests/yaml-parity.test.ts` | Runs each fixture's YAML contract and checks it gives the same results as the TypeScript one. |
| `tests/corpus-suite.test.ts` | Checks that the suite and `tests/fixtures/ts-only/` match the fixture modules, with no document missing or left over. |
| `tests/conformance.test.ts` | Runs the conformance suite's cases against this package. |
| `tests/core-entry.test.ts` | Checks that the built `./core` entry imports no Node module. |

## Adding a validation fixture

1. If a YAML contract expresses the fixture in full, add its cases to the
   `validate` section of the conformance suite: one case per document, named
   `<name>.pass.md` or `<name>.fail.md` (or a single `<name>.md`), with the
   `contract` (YAML) and `source` inputs. Then run `pnpm run build` and
   `pnpm run conformance:write` to write the expected findings. The fixture
   module then loads them by the document's name.
2. If it needs code (a custom rule), write the documents instead in
   `tests/fixtures/ts-only/` as `<name>.<case>.md`, with each one's expected
   findings beside it as `<name>.<case>.expected.json`, and the partial YAML
   contract as `<name>.contract.yaml` with a `# GAP:` comment.
3. Write `tests/fixtures/validation/<name>.ts`:

   ```ts
   import { contract, section, sections, table } from '../../../src/index.js'
   import { loadCorpusSource, loadExpected } from '../../harness.js'
   import type { ValidationFixture } from '../../harness.js'

   const v10b: ValidationFixture = {
     id: 'v10b',
     title: 'Table missing a declared column',
     component: 'content',
     build: () =>
       contract({
         body: sections({}, [
           section('Files', { content: table({ columns: ['Location', 'Kind', 'Change'] }) }),
         ]),
       }),
     cases: [
       {
         label: 'fail — Change column dropped',
         source: loadCorpusSource('./10b-table-missing-column.fail.md'),
         findings: loadExpected('./10b-table-missing-column.fail.expected.json'),
       },
     ],
   }
   export default v10b
   ```

4. Add the fixture to `tests/fixtures/validation/index.ts`, after the
   fixtures that precede it in the suite.

A fixture builds its contract inside `build`, so an error while building fails only
that fixture's tests. Findings are compared on `id` and, when the golden sets them,
`level`, `line` and `hint`.

## YAML parity

A fixture whose YAML contract cannot express everything marks the missing part with a
`# GAP:` comment in the YAML. The parity test leaves out the findings that only code can
produce: custom `rule` / `docRule` ids and `frontmatter/refine`. A fixture with no YAML
contract sets `peerless: true`.
