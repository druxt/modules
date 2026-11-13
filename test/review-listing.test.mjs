// The listing gate's tests. The network is not touched: these assert the
// judgements the report makes, which is the part a reviewer relies on.
//
// The two findings exist because a badge is read as a fact. A listing that
// claims a release nobody can install, or presents an archived repository as
// current, would publish a wrong fact to every page that renders the badge.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  report,
  reviewEntry,
  reviewListings,
  statusFindings,
} from '../scripts/review-listing.mjs'
import { readSchema } from '../scripts/registry.mjs'

const schema = await readSchema()

/**
 * Stub sources. A listing is reviewed against a repository, so the tests
 * supply the repository rather than reading one: these paths are the ones
 * that would otherwise only ever run against the live network.
 */
const sources = (repo, pkg = { peerDependencies: { druxt: '^0.25.0' } }) => ({
  repo: async () => repo,
  packageJson: async () => pkg,
  npmPackage: async () => undefined,
  npmDownloads: async () => undefined,
  drupalProject: async () => undefined,
})

const readable = { private: false, archived: false, defaultBranch: 'main' }
const listing = (data) => ({ file: 'x.yml', key: 'x', data })

test('a claimed release with nothing on npm is queried', () => {
  const found = statusFindings({ status: 'stable' }, {}, false)
  assert.equal(found.length, 1)
  assert.match(found[0], /no published npm package/)
})

test('a claimed prerelease with nothing on npm is queried too', () => {
  assert.equal(statusFindings({ status: 'prerelease' }, {}, false).length, 1)
})

test('a claimed release that npm confirms is not queried', () => {
  const values = { npm: '@druxt-contrib/node-preview' }
  assert.deepEqual(statusFindings({ status: 'stable' }, values, false), [])
})

test('an entry that already records its npm name is not queried', () => {
  assert.deepEqual(statusFindings({ status: 'stable' }, {}, true), [])
})

test('an unreleased listing with nothing on npm is correct, not a finding', () => {
  assert.deepEqual(statusFindings({ status: 'unreleased' }, {}, false), [])
})

test('an archived repository not marked deprecated is queried', () => {
  const found = statusFindings(
    { status: 'stable' },
    { npm: 'x', archived: true },
    false
  )
  assert.equal(found.length, 1)
  assert.match(found[0], /archived/)
})

test('an archived repository marked deprecated is not queried', () => {
  const values = { npm: 'x', archived: true }
  assert.deepEqual(statusFindings({ status: 'deprecated' }, values, false), [])
})

test('a refused listing is reported as unmergeable, with no table', () => {
  const out = report([
    { key: 'x', error: 'it is private, so it cannot be listed' },
  ])
  assert.match(out, /cannot be merged as written/)
  assert.match(out, /it is private/)
  assert.doesNotMatch(out, /\| archived \|/)
})

test("the report states that the decision is the maintainer's", () => {
  const out = report([{ key: 'x', error: 'any' }])
  assert.match(out, /maintainer confirms it rather than a check passing it/)
})

test('a clean listing says so rather than leaving the section empty', () => {
  const out = report([
    {
      key: 'x',
      claimed: { repo: 'druxt/x', status: 'stable', type: 'official' },
      found: {
        repoUrl: 'u',
        type: 'official',
        npm: 'x',
        archived: false,
        druxt: '>=1',
      },
      findings: [],
      notes: [],
    },
  ])
  assert.match(out, /Nothing to query/)
})

test('every finding is rendered as something to confirm', () => {
  const out = report([
    {
      key: 'x',
      claimed: { repo: 'druxt/x', status: 'stable' },
      found: {
        repoUrl: 'u',
        type: 'official',
        archived: true,
        druxt: 'unknown',
      },
      findings: ['claims a thing', 'claims another'],
      notes: ['a note'],
    },
  ])
  assert.match(out, /\*\*Confirm:\*\* this listing claims a thing/)
  assert.match(out, /\*\*Confirm:\*\* this listing claims another/)
  assert.match(out, /- Note: a note/)
})

// These four are the reasons a listing cannot be merged as written. Each one
// used to be reachable only through the live network, and the first of them
// crashed the whole report rather than producing a row.
test('a file that parses to null is a row, not a crash', async () => {
  const row = await reviewEntry(listing(null), schema, sources(readable))
  assert.equal(row.error, 'It does not hold a mapping of fields.')
})

test('a file holding a list is refused as a non-mapping', async () => {
  const row = await reviewEntry(listing(['a']), schema, sources(readable))
  assert.equal(row.error, 'It does not hold a mapping of fields.')
})

test('a file that does not parse says so, quoting the parser', async () => {
  const entry = { file: 'x.yml', key: 'x', parseError: 'bad indentation' }
  const row = await reviewEntry(entry, schema, sources(readable))
  assert.equal(row.error, 'It does not parse as YAML: bad indentation')
})

test('a file that is not .yml says so', async () => {
  const entry = { file: 'x.yaml', key: 'x', extensionError: true }
  const row = await reviewEntry(entry, schema, sources(readable))
  assert.equal(row.error, 'It is not a .yml file.')
})

test('a repository the token cannot read is a row, not a throw', async () => {
  const data = { name: 'x', repo: 'druxt/x', status: 'unreleased' }
  const row = await reviewEntry(listing(data), schema, sources(null))
  assert.match(row.error, /is not a repository this token can read/)
})

test('a private repository is refused, because the output is public', async () => {
  const data = { name: 'x', repo: 'druxt/x', status: 'unreleased' }
  const repo = { ...readable, private: true }
  const row = await reviewEntry(listing(data), schema, sources(repo))
  assert.match(row.error, /is private, so it cannot be listed/)
})

test('a reviewable listing carries what was claimed and what was found', async () => {
  const data = { name: 'x', repo: 'druxt/x', status: 'unreleased' }
  const row = await reviewEntry(listing(data), schema, sources(readable))
  assert.equal(row.error, undefined)
  assert.equal(row.found.repoUrl, 'https://github.com/druxt/x')
  assert.equal(row.found.druxt, '^0.25.0')
  assert.deepEqual(row.findings, [])
})

// The report has to survive a broken listing, or a contributor fixing one file
// loses the evidence for every other file in the same pull request.
test('one unmergeable listing does not cost the others their rows', async () => {
  const entries = [
    listing(null),
    {
      file: 'y.yml',
      key: 'y',
      data: { name: 'y', repo: 'druxt/y', status: 'unreleased' },
    },
  ]
  entries[0].key = 'x'
  const { rows, blocked, missing } = await reviewListings(
    ['x', 'y'],
    entries,
    schema,
    sources(readable)
  )
  assert.equal(rows.length, 2)
  assert.equal(blocked, 1)
  assert.deepEqual(missing, [])
  assert.equal(rows[0].error, 'It does not hold a mapping of fields.')
  assert.equal(rows[1].error, undefined)
  assert.match(report(rows), /### `y`/)
})

test('a key with no file is reported as removed, not as an error', async () => {
  const { rows, missing, blocked } = await reviewListings(
    ['gone'],
    [],
    schema,
    sources(readable)
  )
  assert.deepEqual(rows, [])
  assert.deepEqual(missing, ['gone'])
  assert.equal(blocked, 0)
})
