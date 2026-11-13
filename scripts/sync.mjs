// The sync: reads each module's own repository and writes back the fields the
// registry derives rather than curates.
//
// It is one-way. A registry file is the only place a curated field is written,
// and a derived field is never written anywhere but here, so the two sides
// never contend for the same key and there is no conflict model to design.
//
// Usage: sync.mjs [--check] [<name>...]
//
//   --check     report what would change and exit 1 if anything would, which
//               is what CI runs. Writes nothing.
//   <name>...   limit the run to these entries, for working on one module
//               without spending the rate limit on fifteen.
//
// Exit codes: 0 nothing to do, 1 changes written or pending, 2 cannot run.
//
// What it does not write: `website`, because it is curated. The sync used to
// default it to the repository, which meant that after one run it could not
// tell its own default from a contributor's value and so could never improve
// on it. The build fills the default in the compiled output instead, where it
// is recomputed every time and nothing is written back.
//
// Nor `maintainers`. The schema wants a GitHub handle per
// maintainer, and nothing available states one. npm gives npm usernames
// (`deciphered`, `druxtjs`), a package.json author is a name and an email, and
// GitHub's contributor list is not a maintainer list. Mapping between them
// would be a guess written into a published file, so the field stays absent
// until there is a source that actually says it.

import { readFile, writeFile } from 'node:fs/promises'
import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'

import { parseDocument } from 'yaml'

import { liveSources } from './sources.mjs'
import { derivedType, readModules, readSchema } from './registry.mjs'

/**
 * The name module-template ships with.
 *
 * A module scaffolded from the template and not yet renamed still carries the
 * template's name and description. Those describe the template, not the
 * module, so taking them would publish "Starting point for a Druxt module" as
 * a module's own description. druxt-ckeditor is in exactly that state.
 */
export const TEMPLATE_NAME = 'druxt-module-template'

/** A field the sync owns. Anything here is overwritten, never merged. */
export const DERIVED = [
  'description',
  'npm',
  'compatibility',
  'type',
  'archived',
]

/**
 * What the derived fields should be for one entry.
 *
 * Returns the values and the notes worth printing. A note is not a failure:
 * an absent peer range is worth saying out loud, but it is the module's
 * business, not the registry's.
 */
export async function resolve(entry, schema, sources) {
  const notes = []
  const data = entry.data
  const repo = await sources.repo(data.repo)

  if (!repo) {
    return { error: `${data.repo} is not a repository this token can read` }
  }
  // The compiled file is public, so a private repository must not reach it —
  // and a repository name is prose, which the private-host guard cannot see.
  // This is the check that keeps a private name out of modules.json.
  if (repo.private) {
    return { error: `${data.repo} is private, so it cannot be listed` }
  }

  const values = {
    type: derivedType(data.repo, schema),
    archived: repo.archived,
  }

  const pkg = await sources.packageJson(
    data.repo,
    repo.defaultBranch,
    data.path
  )
  if (!pkg) {
    notes.push(
      `no package.json at ${[data.path, 'package.json'].filter(Boolean).join('/')} on ${repo.defaultBranch}`
    )
  }

  const scaffolded = pkg?.name === TEMPLATE_NAME
  if (scaffolded) {
    notes.push(
      `package.json still carries the template's name and description; GitHub's description is used instead, and the repository needs renaming`
    )
  }

  const own = scaffolded ? undefined : pkg
  const description = own?.description || repo.description
  if (description) values.description = description
  else notes.push('neither package.json nor GitHub gives a description')

  if (own?.name) {
    const published = await sources.npmPackage(own.name)
    if (published) values.npm = published.name
    else notes.push(`package.json names ${own.name}, which is not on npm`)
  }

  // Peer first, then a plain dependency, then said plainly. A guessed range is
  // worse than an absent one when the field exists to tell a visitor whether
  // the module will work.
  const range = pkg?.peerDependencies?.druxt ?? pkg?.dependencies?.druxt
  values.compatibility = { druxt: range ?? 'unknown' }
  if (!range && pkg) {
    notes.push('declares no druxt range in peerDependencies or dependencies')
  }

  return { values, notes }
}

/** The YAML text for `entry` with `values` applied, comments intact. */
export function apply(source, values) {
  const doc = parseDocument(source)
  for (const [key, value] of Object.entries(values)) doc.set(key, value)
  return String(doc)
}

/** Only the keys whose value would actually change. */
export function changes(data, values) {
  const out = {}
  for (const [key, value] of Object.entries(values)) {
    if (JSON.stringify(data[key]) !== JSON.stringify(value)) out[key] = value
  }
  return out
}

async function main(check, only) {
  const [schema, entries] = await Promise.all([readSchema(), readModules()])
  const sources = liveSources()

  const wanted = entries.filter(
    (entry) =>
      !entry.extensionError &&
      !entry.parseError &&
      entry.data &&
      (only.length === 0 || only.includes(entry.key))
  )
  if (!wanted.length) {
    console.error(
      only.length ? `no entry named ${only.join(', ')}` : 'nothing to sync'
    )
    process.exitCode = 2
    return
  }

  let pending = 0
  let failed = 0

  for (const entry of wanted) {
    const { values, notes = [], error } = await resolve(entry, schema, sources)
    if (error) {
      console.error(`error    ${entry.file}: ${error}`)
      failed += 1
      continue
    }
    for (const note of notes) console.warn(`note     ${entry.file}: ${note}`)

    const changed = changes(entry.data, values)
    const keys = Object.keys(changed)
    if (!keys.length) {
      console.log(`unchanged ${entry.file}`)
      continue
    }
    pending += 1
    console.log(
      `${check ? 'would set' : 'set'}  ${entry.file}: ${keys.join(', ')}`
    )
    if (!check) {
      const source = await readFile(entry.path, 'utf8')
      await writeFile(entry.path, apply(source, changed))
    }
  }

  if (failed) {
    console.error(
      `\n${failed} entry could not be read. Nothing else was written.`
    )
    process.exitCode = 2
    return
  }
  if (pending && check) {
    console.error(
      `\n${pending} ${pending === 1 ? 'entry is' : 'entries are'} out of date. Run \`npm run sync\` and commit the result.`
    )
    process.exitCode = 1
    return
  }
  console.log(
    pending
      ? `\n${pending} ${pending === 1 ? 'entry' : 'entries'} updated. Run \`npm run build\` next.`
      : '\nEvery entry already matches its repository.'
  )
}

if (argv[1] && argv[1] === fileURLToPath(import.meta.url)) {
  const args = argv.slice(2)
  await main(
    args.includes('--check'),
    args.filter((a) => !a.startsWith('--'))
  )
}
