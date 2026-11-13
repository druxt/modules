// One test per scenario in the module-registry-source specification, plus the
// control that matters most: the valid entry passes. Every check below is
// written as a mutation of that one entry, so a check that stops working stops
// being the only difference between a pass and a failure.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readFile } from 'node:fs/promises'

import {
  categories,
  derivedType,
  holdsMapping,
  readIcons,
  readModules,
  readSchema,
} from '../scripts/registry.mjs'
import { validate } from '../scripts/validate.mjs'

const schema = await readSchema()
const icons = new Set(['config-pages.svg'])

/** A complete, valid entry. Each test changes one thing about it. */
const valid = () => ({
  name: 'config-pages',
  repo: 'druxt-contrib/druxt-config-pages',
  category: 'content-and-entities',
  status: 'stable',
  icon: 'config-pages.svg',
  drupal: [{ name: 'config_pages', label: 'Config Pages' }],
})

const entry = (data, file = 'config-pages.yml') => ({
  file,
  key: file.replace(/\.yml$/, ''),
  data,
})

const run = (...entries) => validate(entries, schema, icons)

test('a valid entry passes with no errors and no warnings', () => {
  const { errors, warnings } = run(entry(valid()))
  assert.deepEqual(errors, [])
  assert.deepEqual(warnings, [])
})

test('a name that disagrees with the path names both', () => {
  const { errors } = run(entry({ ...valid(), name: 'druxt-config-pages' }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /druxt-config-pages/)
  assert.match(errors[0], /config-pages/)
})

test('a name claimed twice names both files', () => {
  const { errors } = run(
    entry(valid(), 'config-pages.yml'),
    entry({ ...valid(), name: 'config-pages' }, 'config-pages-2.yml')
  )
  const duplicate = errors.filter((message) => /already declared/.test(message))
  assert.equal(duplicate.length, 1)
  assert.match(duplicate[0], /config-pages-2\.yml/)
  assert.match(duplicate[0], /config-pages\.yml/)
})

test('a hand-written type that disagrees with the owner gives the derived value', () => {
  const { errors } = run(entry({ ...valid(), type: 'official' }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /derives "contrib"/)
})

test('a hand-written type that agrees with the owner passes', () => {
  const { errors } = run(entry({ ...valid(), type: 'contrib' }))
  assert.deepEqual(errors, [])
})

test('an owner the project is leaving warns and passes', () => {
  const { errors, warnings } = run(
    entry({ ...valid(), repo: 'Realityloop/druxt-sockets' })
  )
  assert.deepEqual(errors, [])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Realityloop/)
})

test('an invented category lists the accepted values', () => {
  const { errors } = run(entry({ ...valid(), category: 'widgets' }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /widgets/)
  for (const category of schema.properties.category.enum) {
    assert.match(errors[0], new RegExp(category))
  }
})

test('a committed statistic says it belongs to the build', () => {
  const { errors } = run(entry({ ...valid(), downloads: 1234, stars: 7 }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /downloads, stars/)
  assert.match(errors[0], /build/)
})

test('a Drupal machine name with a hyphen names the offending entry', () => {
  const { errors } = run(
    entry({
      ...valid(),
      drupal: [{ name: 'config-pages', label: 'Config Pages' }],
    })
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /\/drupal\/0\/name/)
})

test('a Drupal machine name with an uppercase letter names the offending entry', () => {
  const { errors } = run(
    entry({
      ...valid(),
      drupal: [{ name: 'Config_pages', label: 'Config Pages' }],
    })
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /\/drupal\/0\/name/)
})

test('an empty Drupal list is accepted, an absent one is not', () => {
  assert.deepEqual(run(entry({ ...valid(), drupal: [] })).errors, [])

  const absent = valid()
  delete absent.drupal
  const { errors } = run(entry(absent))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /drupal/)
})

test('an unparsable file is reported rather than thrown', () => {
  const { errors } = run({
    file: 'broken.yml',
    key: 'broken',
    parseError: 'bad indentation of a mapping entry',
  })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /not valid YAML/)
})

test('a file holding a scalar or a list is reported', () => {
  for (const data of ['config-pages', ['config-pages'], null]) {
    const { errors } = run(entry(data))
    assert.equal(errors.length, 1)
    assert.match(errors[0], /mapping of fields/)
  }
})

test('every required curated field is required', () => {
  for (const field of schema.required) {
    const data = valid()
    delete data[field]
    const { errors } = run(entry(data))
    assert.equal(errors.length, 1, `${field} was not required`)
    assert.match(errors[0], new RegExp(field))
  }
})

test('the type derives from the owner, with no special case for a legacy one', () => {
  assert.equal(derivedType('druxt/druxt-menu', schema), 'official')
  assert.equal(
    derivedType('druxt-contrib/druxt-config-pages', schema),
    'contrib'
  )
  assert.equal(derivedType('someone-else/their-module', schema), '3rd-party')
  assert.equal(derivedType('Realityloop/druxt-sockets', schema), '3rd-party')
})

test('an empty registry fails rather than passing vacuously', () => {
  const { errors } = run()
  assert.equal(errors.length, 1)
  assert.match(errors[0], /no registry files/)
})

test('an icon naming a file the repository does not hold is rejected', () => {
  const { errors } = run(entry({ ...valid(), icon: 'missing.svg' }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /missing\.svg/)
  assert.match(errors[0], /icons\//)
})

test('a module the project maintains needs an icon', () => {
  for (const repo of ['druxt/druxt-menu', 'druxt-contrib/druxt-config-pages']) {
    const data = { ...valid(), repo }
    delete data.icon
    const { errors } = run(entry(data))
    assert.equal(errors.length, 1, repo)
    assert.match(errors[0], /needs an icon/)
  }
})

test("a stranger's module is listed without one", () => {
  const data = { ...valid(), repo: 'someone-else/their-module' }
  delete data.icon
  const { errors, warnings } = run(entry(data))
  assert.deepEqual(errors, [])
  assert.deepEqual(warnings, [])
})

test('an icon file name must be a lowercase svg or png', () => {
  for (const icon of [
    'Config-Pages.svg',
    'config_pages.svg',
    'config-pages.gif',
  ]) {
    const { errors } = run(entry({ ...valid(), icon }))
    assert.ok(errors.length >= 1, icon)
  }
})

test('the committed registry passes every check', async () => {
  const [held, entries] = await Promise.all([readIcons(), readModules()])
  assert.ok(held.size > 0, 'icons/ is empty')
  assert.ok(entries.length > 0, 'modules/ is empty')
  const { errors } = validate(entries, schema, held)
  assert.deepEqual(errors, [])
})

test('aliases and archived are accepted fields', () => {
  const { errors } = run(
    entry({
      ...valid(),
      aliases: ['druxt-config-pages', 'config_pages'],
      archived: false,
    })
  )
  assert.deepEqual(errors, [])
})

test('a docs field is no longer accepted', () => {
  const { errors } = run(entry({ ...valid(), docs: 'https://druxtjs.org' }))
  assert.equal(errors.length, 1)
  assert.match(errors[0], /docs/)
})

test('a drupal entry may carry the project url the sync resolves', () => {
  const { errors } = run(
    entry({
      ...valid(),
      drupal: [
        {
          name: 'config_pages',
          label: 'Config Pages',
          url: 'https://www.drupal.org/project/config_pages',
        },
      ],
    })
  )
  assert.deepEqual(errors, [])
})

// The extension rule. A file that is not a .yml used to be filtered out of the
// read entirely, so a contributor's .yaml was not rejected: it was invisible,
// and every job stayed green over a module nobody had listed.

test('a file that is not a .yml is an error, not a skip', () => {
  const { errors } = validate(
    [
      entry(valid()),
      {
        file: 'menu.yaml',
        path: '/modules/menu.yaml',
        key: 'menu.yaml',
        extensionError: true,
      },
    ],
    schema,
    icons
  )
  assert.deepEqual(errors, [
    'menu.yaml: is not a .yml file. A registry file is named <module>.yml, so rename it or move it out of modules/.',
  ])
})

test('readModules reports every name in the directory, not just the .yml ones', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'druxt-modules-'))
  writeFileSync(join(dir, 'menu.yml'), 'name: menu\n')
  writeFileSync(join(dir, 'views.yaml'), 'name: views\n')

  const entries = await readModules(dir)
  assert.deepEqual(
    entries.map((e) => [e.file, Boolean(e.extensionError)]),
    [
      ['menu.yml', false],
      ['views.yaml', true],
    ]
  )
})

// Three documents have now claimed something about the registry that the code
// disagreed with: a sync field, an accepted field, and this count. Prose does
// not run, so each claim it makes gets pinned by something that does.
test('no document states a category count the schema disagrees with', async () => {
  const count = categories(schema).length
  const numbers = {
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  }
  const files = [
    'README.md',
    'CONTRIBUTING.md',
    '.github/pull_request_template.md',
  ]
  const wrong = []

  for (const file of files) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    for (const line of text.split('\n')) {
      if (!/category|categories/i.test(line)) continue
      for (const [word, n] of Object.entries(numbers)) {
        if (n !== count && new RegExp(`\\b${word}\\b`, 'i').test(line)) {
          wrong.push(`${file}: ${line.trim()}`)
        }
      }
    }
  }

  assert.deepEqual(wrong, [], `the schema enumerates ${count} categories`)
})

// An empty file parses to null and a list parses to an array, neither with a
// parse error, so every consumer of readModules shares one test for it.
test('a file that parses to something other than a mapping is refused', () => {
  for (const data of [null, 'a string', 42, ['a', 'list'], true]) {
    assert.equal(
      holdsMapping({ data }),
      false,
      `${JSON.stringify(data)} is not a mapping`
    )
    const { errors } = run(entry(data))
    assert.ok(
      errors.some((e) => e.includes('does not hold a mapping of fields')),
      `${JSON.stringify(data)} should be refused as a non-mapping`
    )
  }
  assert.equal(holdsMapping({ data: valid() }), true)
})
