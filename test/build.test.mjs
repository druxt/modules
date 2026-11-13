// The build's tests. Two things matter here beyond the obvious.
//
// The output has to be a function of the input alone, because --check compares
// committed bytes against a fresh build and a timestamp would make every run
// a difference. And every status the schema accepts has to have a badge
// colour, because a status added to the schema without one would publish a
// grey badge rather than fail.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { badge, compile, render, STATUS_COLOUR } from '../scripts/build.mjs'
import { readModules, readSchema } from '../scripts/registry.mjs'

const schema = await readSchema()

const entry = (data, file = `${data.name}.yml`) => ({
  file,
  path: `/modules/${file}`,
  key: data.name,
  data,
})

const one = (over = {}) =>
  entry({
    name: 'config-pages',
    repo: 'druxt-contrib/druxt-config-pages',
    category: 'content-and-entities',
    status: 'stable',
    drupal: [{ name: 'config_pages', label: 'Config Pages' }],
    ...over,
  })

test('it derives type rather than trusting the file', () => {
  const { modules } = compile([one()], schema)
  assert.equal(modules[0].type, 'contrib')
})

test('it sorts by name, not by directory order', () => {
  const { modules } = compile(
    [one({ name: 'views' }), one({ name: 'auth' }), one({ name: 'menu' })],
    schema
  )
  assert.deepEqual(
    modules.map((m) => m.name),
    ['auth', 'menu', 'views']
  )
})

test('a file that did not parse is left out rather than emitted half-built', () => {
  const broken = { file: 'broken.yml', key: 'broken', parseError: 'bad indent' }
  const { modules } = compile([one(), broken], schema)
  assert.deepEqual(
    modules.map((m) => m.name),
    ['config-pages']
  )
})

test('a file with the wrong extension is left out', () => {
  const wrong = { file: 'x.yaml', key: 'x.yaml', extensionError: true }
  const { modules } = compile([one(), wrong], schema)
  assert.equal(modules.length, 1)
})

test('the same input compiles to the same bytes', () => {
  const entries = [one({ name: 'auth' }), one({ name: 'views' })]
  const first = JSON.stringify(compile(entries, schema))
  const second = JSON.stringify(compile(entries.slice().reverse(), schema))
  assert.equal(first, second)
})

test('nothing in the output records when the build ran', () => {
  const text = JSON.stringify(compile([one()], schema))
  for (const word of ['generated', 'generatedAt', 'timestamp', 'builtAt']) {
    assert.ok(!text.includes(word), `output carries ${word}`)
  }
})

test('every status the schema accepts has a badge colour', () => {
  for (const status of schema.properties.status.enum) {
    assert.ok(STATUS_COLOUR[status], `no colour for status "${status}"`)
  }
})

test('a badge is a shields endpoint response', () => {
  const made = badge({ name: 'config-pages', status: 'stable' })
  assert.equal(made.schemaVersion, 1)
  assert.equal(made.message, 'stable')
  assert.match(made.color, /^[0-9a-f]{6}$/)
  assert.ok(made.cacheSeconds >= 300, 'shields floors cacheSeconds at 300')
})

test('an unknown status renders rather than throwing', () => {
  assert.equal(badge({ name: 'x', status: 'invented' }).color, 'lightgrey')
})

test('one badge per module, named after it', () => {
  const files = [
    ...render([one({ name: 'auth' }), one({ name: 'menu' })], schema).keys(),
  ]
  assert.equal(files.filter((p) => p.endsWith('modules.json')).length, 1)
  assert.ok(files.some((p) => p.endsWith('badges/auth.json')))
  assert.ok(files.some((p) => p.endsWith('badges/menu.json')))
  assert.equal(files.length, 3)
})

test('the committed output matches the committed registry', async () => {
  const entries = await readModules()
  const { modules } = compile(entries, schema)
  assert.ok(modules.length > 0, 'modules/ is empty')

  const { readFile } = await import('node:fs/promises')
  const { outputs } = await import('../scripts/build.mjs')
  const onDisk = JSON.parse(await readFile(outputs.modules, 'utf8'))
  assert.deepEqual(onDisk, { schemaVersion: 1, modules })
})
