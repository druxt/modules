// The listing gate's tests. The network is not touched: these assert the
// judgements the report makes, which is the part a reviewer relies on.
//
// The two findings exist because a badge is read as a fact. A listing that
// claims a release nobody can install, or presents an archived repository as
// current, would publish a wrong fact to every page that renders the badge.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { report, statusFindings } from '../scripts/review-listing.mjs'

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
