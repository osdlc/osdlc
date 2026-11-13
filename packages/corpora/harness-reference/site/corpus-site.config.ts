// What the site says about the harness reference that its schemas do not: labels, help text,
// the columns and filters of each type, and badge colours.
import { defineCorpusSite } from '@osdlc/corpus-site'

const SPEC = 'https://github.com/osdlc/osdlc/tree/main/packages/corpora/harness-reference'

export default defineCorpusSite({
  description:
    'A cited record of how coding-agent harnesses differ. Every claim names its evidence and the date it was seen.',
  typeOrder: ['statements', 'study-results', 'harnesses', 'subjects', 'documents', 'methods'],
  types: {
    statements: {
      blurb: 'A claim about one harness and one subject, with its evidence and its verdict.',
      intro:
        'A claim about one harness and one subject, the evidence lines that support or dispute it, and how far the evidence backs it. See [subjects](../subjects/subjects.schema.md) for the questions and [study results](../study-results/study-results.schema.md) for the evidence.',
      summary: '{harness} · {subject}',
      columns: ['title', 'harness', 'subject', 'status', 'direction', 'strength'],
      filters: ['status', 'direction', 'strength', 'harness', 'subject', 'scope.platform'],
      sort: 'title',
      sections: [
        { label: 'Claim', fields: ['harness', 'subject', 'proposition', 'scope'] },
        {
          label: 'Verdict',
          fields: ['status', 'direction', 'strength', 'supersedes', 'open'],
          note: 'How far the evidence backs the claim.',
        },
        { label: 'Evidence', fields: ['hasEvidenceLines', 'reportedIn', 'specifiedBy'] },
      ],
      fields: {
        status: {
          note: 'Start with Current. Superseded claims are kept for history.',
          info: 'One statement is current for each harness, subject and scope. A later statement supersedes it and links back to it.',
          link: { href: `${SPEC}/corpus/statements/statements.schema.md`, label: 'The statement schema' },
          values: {
            current: { label: 'Current', color: 'green', description: 'Holds now.' },
            superseded: { label: 'Superseded', color: 'neutral', description: 'A later statement replaced it.' },
            disputed: { label: 'Disputed', color: 'red', description: 'Study results disagree in the same scope.' },
            open: { label: 'Open', color: 'amber', description: 'Only open questions, and no value yet.' },
          },
        },
        direction: {
          help: 'Whether the statement holds its proposition true, false or neither.',
          values: {
            supports: { label: 'Supports', color: 'green', description: 'The evidence says the proposition is true.' },
            neutral: { label: 'Neutral', color: 'neutral', description: 'The evidence settles nothing.' },
            disputes: { label: 'Disputes', color: 'red', description: 'The evidence says the proposition is false.' },
          },
        },
        strength: {
          note: 'A neutral statement has no strength.',
          info: 'Strength follows the best kind of evidence on a supporting line. A run, source code and help text are strong. Docs and changelogs are moderate. Issues, third-party pages and inferences are weak. A disputing line lowers it one step.',
          values: {
            strong: { label: 'Strong', color: 'accent' },
            moderate: { label: 'Moderate', color: 'blue' },
            weak: { label: 'Weak', color: 'neutral' },
          },
        },
        harness: { help: 'The harness the claim is about.' },
        subject: { help: 'The question the claim answers.', note: 'Subjects are grouped by category on their own page.' },
        'scope.platform': {
          label: 'Platform',
          help: 'The operating systems the claim holds on. A claim with none holds on all.',
          control: 'chips',
          values: { macos: { label: 'macOS' }, linux: { label: 'Linux' }, windows: { label: 'Windows' } },
        },
        'scope.since': { label: 'Since version', format: 'code' },
        'scope.until': { label: 'Until version', format: 'code' },
        'proposition.predicate': { label: 'Subject slug', format: 'code' },
        hasEvidenceLines: { label: 'Evidence lines' },
        reportedIn: { label: 'Reported in' },
        specifiedBy: { label: 'Method' },
        imported_from: { hidden: true },
        contributions: { order: 99 },
      },
    },
    'study-results': {
      blurb: 'One observation: what a document said or a run found, and the date we looked.',
      intro:
        'One observation of a harness: what a document said, or what a run of a method found, on one date. A study result states no conclusion. A [statement](../statements/statements.schema.md) makes the claim and cites study results as its evidence.',
      summary: '{harness} · {kind} · {observed}',
      columns: ['title', 'harness', 'kind', 'observed', 'version', 'version_basis'],
      filters: ['kind', 'version_basis', 'harness', 'observed', 'specifiedBy'],
      sort: '-observed',
      sections: [{ label: 'Observation', fields: ['harness', 'kind', 'observed', 'version', 'version_basis', 'locator', 'excerpt'] }],
      fields: {
        kind: {
          control: 'chips',
          note: 'A run, source code and help text count most.',
          info: 'What was looked at. The kind sets how much the result counts when a statement cites it.',
          values: {
            docs: { label: 'Docs', color: 'blue', description: 'The vendor documentation.' },
            changelog: { label: 'Changelog', color: 'blue', description: 'A release note.' },
            source: { label: 'Source', color: 'accent', description: 'The source code.' },
            'help-text': { label: 'Help text', color: 'accent', description: 'The output of a help command.' },
            run: { label: 'Run', color: 'green', description: 'A run of a method anyone can repeat.' },
            issue: { label: 'Issue', color: 'amber', description: 'An issue thread.' },
            'third-party': { label: 'Third party', color: 'amber', description: 'A page by someone other than the vendor.' },
            inferred: { label: 'Inferred', color: 'neutral', description: 'A conclusion drawn from other study results.' },
          },
        },
        version_basis: {
          label: 'Version basis',
          help: 'How the version is known.',
          values: {
            exact: { label: 'Exact', color: 'green', description: 'The source names the version.' },
            inferred: { label: 'Inferred', color: 'amber', description: 'Worked out from the date or the context.' },
            unknown: { label: 'Unknown', color: 'neutral' },
          },
        },
        observed: { help: 'The date we looked. It is not the page’s own date.', format: { kind: 'date', dateStyle: 'medium' } },
        version: { format: 'code' },
        specifiedBy: { label: 'Method', help: 'The method a run followed.', note: 'Only runs have a method.' },
        reportedIn: { label: 'Reported in' },
        imported_from: { hidden: true },
        contributions: { order: 99 },
      },
    },
    harnesses: {
      blurb: 'One record per harness or standard: who makes it, where it runs and whether it is still developed.',
      summary: '{vendor}',
      columns: ['title', 'vendor', 'status', 'kind', 'surfaces', 'open_source', 'checked'],
      filters: ['status', 'kind', 'surfaces', 'open_source', 'versioning'],
      fields: {
        status: {
          values: {
            current: { label: 'Current', color: 'green' },
            sunsetting: { label: 'Sunsetting', color: 'amber', description: 'The vendor has named an end date or a successor.' },
            retired: { label: 'Retired', color: 'neutral' },
          },
        },
        kind: { values: { harness: { label: 'Harness' }, standard: { label: 'Standard', color: 'purple' } } },
        surfaces: {
          values: { cli: { label: 'CLI' }, ide: { label: 'IDE' }, desktop: { label: 'Desktop' }, web: { label: 'Web' } },
        },
        open_source: { label: 'Open source' },
        checked: { label: 'Last checked' },
        cli: { label: 'CLI command', format: 'code' },
        slug: { format: 'code' },
        license: { format: 'code' },
        homepage: { format: 'link' },
        docs: { format: 'link' },
        repository: { format: 'link' },
      },
    },
    subjects: {
      blurb: 'One question asked of every harness, with the shape of its answer.',
      summary: '{description}',
      columns: ['title', 'category', 'slug', 'cardinality'],
      filters: ['category', 'model_dependent', 'cardinality'],
      sort: 'slug',
      fields: {
        category: { control: 'select', format: 'badge' },
        slug: { format: 'code' },
        model_dependent: { label: 'Model dependent' },
        valueSchema: { label: 'Value schema', order: 99 },
      },
    },
    documents: {
      blurb: 'A page we can point at, grouped by publisher.',
      columns: ['title', 'publisher', 'url_status', 'documentType'],
      filters: ['url_status', 'publisher'],
      fields: {
        url_status: {
          label: 'Link status',
          values: { live: { label: 'Live', color: 'green' }, dead: { label: 'Dead', color: 'red' } },
        },
        publisher: { control: 'select' },
        documentType: { label: 'Document type' },
        urls: { label: 'URLs' },
      },
    },
    methods: {
      blurb: 'A probe: a run anyone can repeat.',
      columns: ['title', 'methodType', 'harnesses'],
      filters: ['harnesses', 'subjects'],
      fields: { methodType: { label: 'Method type' }, imported_from: { hidden: true } },
    },
  },
})
