// The sync's tests. The network is stubbed, so these assert the derivation
// rules rather than what GitHub happened to return today.
//
// The cases that matter most are the refusals and the fallbacks: a private
// repository must not reach a public file, and an absent Druxt range must be
// recorded as unknown rather than guessed, because a wrong range is worse than
// an absent one when the field exists to tell a visitor whether a module works.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { readSchema } from '../scripts/registry.mjs'
import {
  apply,
  changes,
  DERIVED,
  resolve,
  TEMPLATE_NAME,
} from '../scripts/sync.mjs'

const schema = await readSchema()

/** A source stub. Anything not overridden is the ordinary healthy case. */
function sources({ repo = {}, pkg = {}, npm = true } = {}) {
  return {
    async repo() {
      if (repo === null) return undefined
      return {
        private: false,
        archived: false,
        description: 'What GitHub says.',
        defaultBranch: '0.x',
        url: 'https://github.com/druxt-contrib/druxt-config-pages',
        stars: 3,
        ...repo,
      }
    },
    async packageJson() {
      if (pkg === null) return undefined
      return {
        name: '@druxt-contrib/config-pages',
        description: 'What the package says.',
        ...pkg,
      }
    },
    async npmPackage(name) {
      return npm ? { name, latest: '0.1.3' } : undefined
    },
    async drupalProject() {
      return undefined
    },
  }
}

const entry = (over = {}) => ({
  file: 'config-pages.yml',
  path: '/modules/config-pages.yml',
  key: 'config-pages',
  data: {
    name: 'config-pages',
    repo: 'druxt-contrib/druxt-config-pages',
    category: 'content-and-entities',
    status: 'stable',
    drupal: [{ name: 'config_pages', label: 'Config Pages' }],
    ...over,
  },
})

test('type comes from the repository owner, not the file', async () => {
  const { values } = await resolve(entry(), schema, sources())
  assert.equal(values.type, 'contrib')

  const official = await resolve(
    entry({ repo: 'druxt/druxt.js' }),
    schema,
    sources()
  )
  assert.equal(official.values.type, 'official')

  const third = await resolve(
    entry({ repo: 'someone/their-module' }),
    schema,
    sources()
  )
  assert.equal(third.values.type, '3rd-party')
})

test('a private repository is refused, not listed', async () => {
  const { error, values } = await resolve(
    entry(),
    schema,
    sources({ repo: { private: true } })
  )
  assert.match(error, /is private/)
  assert.equal(values, undefined)
})

test('a repository the token cannot read is refused', async () => {
  const { error } = await resolve(entry(), schema, sources({ repo: null }))
  assert.match(error, /not a repository this token can read/)
})

test('archived is recorded, so a listing cannot look maintained', async () => {
  const { values } = await resolve(
    entry(),
    schema,
    sources({ repo: { archived: true } })
  )
  assert.equal(values.archived, true)
})

test('the peer range wins over a plain dependency', async () => {
  const { values } = await resolve(
    entry(),
    schema,
    sources({
      pkg: {
        peerDependencies: { druxt: '>=0.25.0 <1' },
        dependencies: { druxt: '^0.20.0' },
      },
    })
  )
  assert.equal(values.compatibility.druxt, '>=0.25.0 <1')
})

test('a plain dependency is used when there is no peer', async () => {
  const { values } = await resolve(
    entry(),
    schema,
    sources({ pkg: { dependencies: { druxt: '^0.24.0' } } })
  )
  assert.equal(values.compatibility.druxt, '^0.24.0')
})

test('neither is recorded as unknown and said out loud, never guessed', async () => {
  const { values, notes } = await resolve(entry(), schema, sources())
  assert.equal(values.compatibility.druxt, 'unknown')
  assert.ok(
    notes.some((n) => /declares no druxt range/.test(n)),
    'the absence is reported'
  )
})

test('npm is set only for a package that is actually published', async () => {
  const published = await resolve(entry(), schema, sources())
  assert.equal(published.values.npm, '@druxt-contrib/config-pages')

  const not = await resolve(entry(), schema, sources({ npm: false }))
  assert.equal(not.values.npm, undefined)
  assert.ok(not.notes.some((n) => /is not on npm/.test(n)))
})

test('a package.json still carrying the template is not read as the module', async () => {
  const { values, notes } = await resolve(
    entry(),
    schema,
    sources({
      pkg: {
        name: TEMPLATE_NAME,
        description: 'Starting point for a Druxt module.',
      },
    })
  )
  assert.equal(values.description, 'What GitHub says.')
  assert.equal(
    values.npm,
    undefined,
    'the template name is not published as this module'
  )
  assert.ok(notes.some((n) => /needs renaming/.test(n)))
})

test('the package description wins, and GitHub is the fallback', async () => {
  const own = await resolve(entry(), schema, sources())
  assert.equal(own.values.description, 'What the package says.')

  const fallback = await resolve(entry(), schema, sources({ pkg: null }))
  assert.equal(fallback.values.description, 'What GitHub says.')
  assert.ok(fallback.notes.some((n) => /no package\.json at/.test(n)))
})

test('website is never written, because it is curated', async () => {
  const { values } = await resolve(entry(), schema, sources())
  assert.equal('website' in values, false)
  assert.equal(DERIVED.includes('website'), false)
})

test('every field the sync claims is one the schema knows', () => {
  for (const field of DERIVED) {
    assert.ok(schema.properties[field], `schema has no ${field}`)
  }
})

test('applying values keeps the comments and the curated fields', () => {
  const source = [
    '# Why this module is listed.',
    'name: config-pages',
    'repo: druxt-contrib/druxt-config-pages',
    'status: stable',
    '',
  ].join('\n')

  const out = apply(source, {
    description: 'Set by the sync.',
    archived: false,
  })
  assert.match(out, /# Why this module is listed\./)
  assert.match(out, /name: config-pages/)
  assert.match(out, /status: stable/)
  assert.match(out, /description: Set by the sync\./)
  assert.match(out, /archived: false/)
})

test('an existing derived value is replaced, not duplicated', () => {
  const out = apply('name: x\ndescription: old\n', { description: 'new' })
  assert.equal((out.match(/^description:/gm) || []).length, 1)
  assert.match(out, /description: new/)
})

test('changes reports only what would differ, so the sync is idempotent', () => {
  const data = { description: 'same', archived: false, type: 'contrib' }
  assert.deepEqual(changes(data, { description: 'same', archived: false }), {})
  assert.deepEqual(changes(data, { description: 'other' }), {
    description: 'other',
  })
  assert.deepEqual(
    changes(data, { compatibility: { druxt: 'unknown' } }),
    { compatibility: { druxt: 'unknown' } },
    'a nested value absent from the file is a change'
  )
})

// The review that found a documented field the validator rejected was right
// about the class, not just the instance: prose in the README outruns the code
// and no test notices. This reads the README's own ownership table back and
// holds it to DERIVED, so a field the sync stops writing cannot keep its row.
test('the README names exactly the fields the sync writes', async () => {
  const readme = await readFile(
    new URL('../README.md', import.meta.url),
    'utf8'
  )
  const row = readme
    .split('\n')
    .find((line) => line.includes('the sync, from your repository'))
  assert.ok(row, 'the ownership table has no sync row')
  const documented = [...row.matchAll(/`([a-z]+)`/g)].map((match) => match[1])
  assert.deepEqual(
    documented.sort(),
    [...DERIVED].sort(),
    'the README and sync.mjs disagree about which fields the sync writes'
  )
})
