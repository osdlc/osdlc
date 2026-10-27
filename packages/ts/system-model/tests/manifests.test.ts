import { describe, expect, test } from 'vitest'

import { parsePackageJson } from '../src/plugins/node/package-json.ts'
import { parsePyproject } from '../src/plugins/python/ecosystem.ts'
import { parseGemfile } from '../src/plugins/ruby/gemfile.ts'
import { parseCargo } from '../src/plugins/rust/ecosystem.ts'

describe('parseGemfile', () => {
  const kinds = (text: string) =>
    parseGemfile(text, 'Gemfile').deps?.map((d) => [d.name, d.kind]) ?? []

  test('the `end` of a nested block does not close the group around it', () => {
    const text = [
      'group :test do',
      '  platforms :mri do',
      "    gem 'byebug'",
      '  end',
      "  gem 'rspec'",
      'end',
      "gem 'rails'",
    ].join('\n')
    expect(kinds(text)).toEqual([
      ['byebug', 'dev'],
      ['rspec', 'dev'],
      ['rails', 'prod'],
    ])
  })

  test('a `do` block and an `if` inside a group do not close it', () => {
    const text = [
      'group :test do',
      "  source 'https://gems.example' do",
      "    gem 'private-gem'",
      '  end',
      "  if ENV['CI']",
      "    gem 'ci-reporter'",
      '  end',
      "  gem 'rspec'",
      'end',
      "gem 'rack'",
    ].join('\n')
    expect(kinds(text)).toEqual([
      ['private-gem', 'dev'],
      ['ci-reporter', 'dev'],
      ['rspec', 'dev'],
      ['rack', 'prod'],
    ])
  })

  test('a group naming :production is prod', () => {
    expect(kinds("group :development, :production do\n  gem 'puma'\nend\n")).toEqual([
      ['puma', 'prod'],
    ])
  })
})

describe('parseCargo', () => {
  test('every dependency table and spec form, in table then key order', () => {
    const text = [
      '[package]',
      'name = "app"',
      'version = "0.1.0"',
      'description = "An app."',
      'publish = false',
      '',
      '[[bin]]',
      'name = "app"',
      '',
      '[dependencies]',
      'serde = "1"',
      'local = { path = "../local" }',
      'shared = { workspace = true }',
      'forked = { git = "https://example.com/forked" }',
      'renamed = { package = "real", version = "2" }',
      'empty = {}',
      '',
      '[dev-dependencies]',
      'proptest = "1"',
      '',
      '[build-dependencies]',
      'cc = "1"',
      '',
    ].join('\n')
    expect(parseCargo(text, 'Cargo.toml')).toEqual({
      manifestPath: 'Cargo.toml',
      workspace: false,
      name: 'app',
      version: '0.1.0',
      private: true,
      description: 'An app.',
      hasBin: true,
      // Keys sort byte-wise; a renamed dependency goes by its real name.
      deps: [
        { name: 'empty', kind: 'prod', specifier: '', specifierKind: 'other' },
        {
          name: 'forked',
          kind: 'prod',
          specifier: 'https://example.com/forked',
          specifierKind: 'other',
        },
        { name: 'local', kind: 'prod', specifier: '../local', specifierKind: 'path' },
        { name: 'real', kind: 'prod', specifier: '2', specifierKind: 'registry' },
        { name: 'serde', kind: 'prod', specifier: '1', specifierKind: 'registry' },
        { name: 'shared', kind: 'prod', specifier: 'workspace', specifierKind: 'workspace' },
        { name: 'proptest', kind: 'dev', specifier: '1', specifierKind: 'registry' },
        { name: 'cc', kind: 'build', specifier: '1', specifierKind: 'registry' },
      ],
    })
  })

  test('invalid TOML still yields a fact, with the error and the [workspace] header', () => {
    const fact = parseCargo('[workspace]\nmembers = ["crates/*"\n', 'Cargo.toml')
    expect(fact.error).toMatch(/^parse failed/)
    expect(fact.workspace).toBe(true)
    expect(fact.workspaceMembers).toBeUndefined()
    expect(fact.deps).toBeUndefined()
  })
})

describe('parsePackageJson', () => {
  test('specifier kinds, every dependency table and the package fields', () => {
    const text = JSON.stringify({
      name: 'app',
      version: '1.0.0',
      description: 'An app.',
      private: true,
      bin: { app: 'cli.js' },
      workspaces: { packages: ['packages/*'] },
      dependencies: {
        f: '^1',
        g: 'workspace:*',
        h: 'file:../h',
        i: 'npm:x@1',
        j: './vendor/j',
        n: 1,
      },
      devDependencies: { d: '^2' },
      peerDependencies: { p: '>=3' },
      optionalDependencies: { o: '4' },
    })
    expect(parsePackageJson(text, 'package.json')).toEqual({
      manifestPath: 'package.json',
      name: 'app',
      scripts: {},
      dependencies: ['d', 'f', 'g', 'h', 'i', 'j', 'n', 'o', 'p'],
      version: '1.0.0',
      private: true,
      description: 'An app.',
      workspaces: ['packages/*'],
      hasBin: true,
      deps: [
        { name: 'f', kind: 'prod', specifier: '^1', specifierKind: 'registry' },
        { name: 'g', kind: 'prod', specifier: 'workspace:*', specifierKind: 'workspace' },
        { name: 'h', kind: 'prod', specifier: 'file:../h', specifierKind: 'file' },
        { name: 'i', kind: 'prod', specifier: 'npm:x@1', specifierKind: 'other' },
        { name: 'j', kind: 'prod', specifier: './vendor/j', specifierKind: 'other' },
        { name: 'n', kind: 'prod', specifier: '1', specifierKind: 'registry' },
        { name: 'd', kind: 'dev', specifier: '^2', specifierKind: 'registry' },
        { name: 'p', kind: 'peer', specifier: '>=3', specifierKind: 'registry' },
        { name: 'o', kind: 'optional', specifier: '4', specifierKind: 'registry' },
      ],
    })
  })

  test('an empty bin object is no bin, and a non-object throws', () => {
    expect(parsePackageJson('{"bin":{}}', 'package.json').hasBin).toBeUndefined()
    expect(parsePackageJson('{"bin":"cli.js"}', 'package.json').hasBin).toBe(true)
    expect(() => parsePackageJson('[]', 'package.json')).toThrow(/not a JSON object/)
  })
})

describe('parsePyproject', () => {
  test('poetry dependencies skip `python` and keep file order; a table spec has no specifier', () => {
    const text = [
      '[tool.poetry]',
      'name = "app"',
      '',
      '[tool.poetry.dependencies]',
      'python = "^3.11"',
      'requests = "^2.31"',
      'rich = { version = "^13", optional = true }',
      '',
    ].join('\n')
    const fact = parsePyproject(text, 'pyproject.toml')
    expect(fact.name).toBe('app')
    expect(fact.deps).toEqual([
      { name: 'requests', kind: 'prod', specifier: '^2.31', specifierKind: 'registry' },
      { name: 'rich', kind: 'prod', specifier: '', specifierKind: 'registry' },
    ])
  })

  test('[project].name wins over [tool.poetry].name', () => {
    const text = '[project]\nname = "pep621"\n\n[tool.poetry]\nname = "poetry"\n'
    expect(parsePyproject(text, 'pyproject.toml').name).toBe('pep621')
  })
})
