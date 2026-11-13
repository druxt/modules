// Compiling the registry into the files other things read.
//
// Two outputs, both committed, both served straight from the repository by
// jsDelivr. No service runs behind either of them.
//
//   modules.json      the whole registry, one document
//   badges/<name>.json  a shields.io endpoint response per module
//
// The output carries no timestamp and no build number. That is deliberate: a
// build that embedded the time it ran would produce a different file on every
// run, so "has the output changed" could never be answered, and --check below
// would be worthless. Same input, same bytes.
//
// What is not here: version, download and star counts come from npm and
// GitHub, and resolving them needs the network. They belong to the build too,
// but they are a separate step with its own failure modes, and nothing in the
// registry needs them to be useful first.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'

import { derivedType, paths, readModules, readSchema } from './registry.mjs'

export const outputs = {
  modules: join(paths.root, 'modules.json'),
  badges: join(paths.root, 'badges'),
}

/** The statuses a badge can show, and the colour each one gets. */
export const STATUS_COLOUR = {
  stable: '00a4d3',
  prerelease: '7c4dff',
  unreleased: '9e9e9e',
  deprecated: 'b00020',
}

/**
 * The compiled registry.
 *
 * Only `type` is added, because it is derived rather than written and a reader
 * should not have to know the owner rules to get it. Entries are sorted by
 * name so the output does not depend on the order the directory was read in.
 */
export function compile(entries, schema) {
  const modules = entries
    .filter((entry) => entry.data && !entry.parseError && !entry.extensionError)
    .map((entry) => ({
      ...entry.data,
      type: derivedType(entry.data.repo, schema),
      // Defaulted here rather than written back to the file. website is a
      // curated field, so the sync must not fill it: a default written into
      // the source becomes indistinguishable from a contributor's choice.
      // Computed from repo, so it costs no network and improves for every
      // entry at once.
      website: entry.data.website || `https://github.com/${entry.data.repo}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))

  return { schemaVersion: 1, modules }
}

/**
 * A shields.io endpoint response for one module.
 *
 * The label is a default: a README that wants a different one appends
 * `&label=release` to the badge URL, so this does not have to guess the
 * column it will sit in.
 */
export function badge(module) {
  return {
    schemaVersion: 1,
    label: 'status',
    message: module.status,
    color: STATUS_COLOUR[module.status] ?? 'lightgrey',
    // shields caches for at least 300 seconds whatever is asked. An hour is
    // well under how often a status changes, and keeps jsDelivr's own
    // twelve-hour edge cache the slower of the two.
    cacheSeconds: 3600,
  }
}

const json = (value) => JSON.stringify(value, null, 2) + '\n'

/** Every file the build owns, as a map of absolute path to contents. */
export function render(entries, schema) {
  const registry = compile(entries, schema)
  const files = new Map([[outputs.modules, json(registry)]])
  for (const module of registry.modules) {
    files.set(join(outputs.badges, `${module.name}.json`), json(badge(module)))
  }
  return files
}

async function read(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/** Badge files on disk that no module claims any more. */
async function orphans(files) {
  let held
  try {
    held = await readdir(outputs.badges)
  } catch {
    return []
  }
  return held
    .map((name) => join(outputs.badges, name))
    .filter((path) => !files.has(path))
}

async function main(check) {
  const [schema, entries] = await Promise.all([readSchema(), readModules()])
  const files = render(entries, schema)
  const stale = await orphans(files)

  if (check) {
    const changed = []
    for (const [path, contents] of files) {
      if ((await read(path)) !== contents) changed.push(path)
    }
    const problems = [...changed, ...stale]
    if (problems.length) {
      console.error(
        [
          '',
          'The committed output does not match the registry files:',
          '',
          ...changed.map((p) => `  stale    ${p}`),
          ...stale.map((p) => `  orphaned ${p}`),
          '',
          'Run `npm run build` and commit the result.',
          '',
        ].join('\n')
      )
      process.exitCode = 1
      return
    }
    console.log(`${files.size} built files match the registry.`)
    return
  }

  await mkdir(outputs.badges, { recursive: true })
  for (const [path, contents] of files) await writeFile(path, contents)
  for (const path of stale) await rm(path)

  const count = files.size - 1
  console.log(
    `modules.json and ${count} badge${count === 1 ? '' : 's'} written` +
      (stale.length ? `, ${stale.length} removed` : '') +
      '.'
  )
}

if (argv[1] && argv[1] === fileURLToPath(import.meta.url)) {
  await main(argv.includes('--check'))
}
