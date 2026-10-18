# Fixture-driven tests

`tests/` holds the suites that run the whole engine. Unit tests sit next to their
module in `src/` as `*.test.ts` files.

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
| `../corpus/` | The shared validation corpus: documents, YAML contracts and expected findings. See `corpus/README.md`. |
| `tests/validation.test.ts`, `tests/consumption.test.ts`, `tests/inference.test.ts` | Feed the fixtures to the runners. |
| `tests/yaml-parity.test.ts` | Runs each fixture's YAML contract and checks it gives the same results as the TypeScript one. |
| `tests/corpus-manifest.test.ts` | Checks that `corpus/corpus-manifest.json` matches the fixture modules. |
| `tests/core-entry.test.ts` | Checks that the built `./core` entry imports no Node module. |

## Adding a validation fixture

1. Write the documents in `corpus/`: `<name>.pass.md` and `<name>.fail.md` (or a
   single `<name>.md`).
2. Write each document's expected findings next to it as `<name>.<case>.expected.json`.
3. Write the YAML contract as `corpus/<name>.contract.yaml`, when YAML can express it.
4. Write `tests/fixtures/validation/<name>.ts`:

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

5. Add the fixture to `tests/fixtures/validation/index.ts` and to
   `corpus/corpus-manifest.json`.

A fixture builds its contract inside `build`, so an error while building fails only
that fixture's tests. Findings are compared on `id` and, when the golden sets them,
`level`, `line` and `hint`.

## YAML parity

A fixture whose YAML contract cannot express everything marks the missing part with a
`# GAP:` comment in the YAML. The parity test leaves out the findings that only code can
produce: custom `rule` / `docRule` ids and `frontmatter/refine`. A fixture with no YAML
contract sets `peerless: true`.
