// The listing gate. Everything a pull request adding one file has to satisfy.
//
// Errors fail the run. Warnings print and pass, because a warning is a
// judgement for the reviewer rather than a rule: see the legacy-owner check.
//
// Messages name the file and say what the accepted value is. A contributor
// listing their own module reads the output of this script and nothing else,
// so "category must be equal to one of the allowed values" is a failure of
// this script, not of the contributor.

import { realpath } from 'node:fs/promises'
import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'

// The 2020-12 build, matching the $schema the module schema declares. The
// package's default export speaks draft-07 and rejects the schema outright.
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

import {
  buildFields,
  categories,
  derivedType,
  EXTENSION,
  firstPartyOwners,
  holdsMapping,
  legacyOwners,
  owner,
  readIcons,
  readModules,
  readSchema,
} from './registry.mjs'

/** Shape validation, with the schema's own extension keywords ignored. */
function compile(schema) {
  // verbose, so an error carries the offending value: a message that quotes it
  // beats one that only names the keyword.
  const ajv = new Ajv({ allErrors: true, strict: false, verbose: true })
  addFormats(ajv)
  return ajv.compile(schema)
}

function shapeMessage(error, schema) {
  const at = error.instancePath || '/'

  if (error.keyword === 'enum' && error.instancePath === '/category') {
    return `category "${error.data}" is not one of: ${categories(schema).join(', ')}`
  }
  if (error.keyword === 'enum') {
    return `${at} must be one of: ${error.params.allowedValues.join(', ')}`
  }
  if (error.keyword === 'pattern') {
    return `${at} is "${error.data}", which does not match ${error.params.pattern}`
  }
  if (error.keyword === 'required') {
    return `${at === '/' ? '' : at + ' '}is missing ${error.params.missingProperty}`
  }
  if (error.keyword === 'additionalProperties') {
    return `${at === '/' ? '' : at + ' '}has an unknown field: ${error.params.additionalProperty}`
  }
  return `${at} ${error.message}`
}

export function validate(entries, schema, icons = new Set()) {
  const errors = []
  const warnings = []
  const validateShape = compile(schema)
  const seen = new Map()

  // An empty registry would pass every check below, which would make this
  // script a green that was never earned: the day modules/ is emptied by a bad
  // merge, nothing else here notices.
  if (!entries.length) {
    errors.push('modules/ holds no registry files')
    return { errors, warnings }
  }

  for (const entry of entries) {
    const fail = (message) => errors.push(`${entry.file}: ${message}`)
    const warn = (message) => warnings.push(`${entry.file}: ${message}`)

    if (entry.extensionError) {
      fail(
        `is not a ${EXTENSION} file. A registry file is named <module>${EXTENSION}, so rename it or move it out of modules/.`
      )
      continue
    }
    if (entry.parseError) {
      fail(`is not valid YAML: ${entry.parseError}`)
      continue
    }
    if (!holdsMapping(entry)) {
      fail('does not hold a mapping of fields')
      continue
    }

    // Before the shape check, so the message says where the value comes from
    // rather than reporting an unknown field.
    const committed = buildFields(schema).filter((field) => field in entry.data)
    if (committed.length) {
      fail(
        `commits ${committed.join(', ')}, which the build resolves from npm and GitHub. Remove them.`
      )
    }

    if (!validateShape(entry.data)) {
      for (const error of validateShape.errors) {
        if (
          error.keyword === 'additionalProperties' &&
          committed.includes(error.params.additionalProperty)
        ) {
          continue
        }
        fail(shapeMessage(error, schema))
      }
    }

    if (entry.data.name && entry.data.name !== entry.key) {
      fail(
        `declares name "${entry.data.name}" but its path says "${entry.key}"`
      )
    }

    if (entry.data.name) {
      const claimed = seen.get(entry.data.name)
      if (claimed)
        fail(
          `claims the name "${entry.data.name}", already declared by ${claimed}`
        )
      else seen.set(entry.data.name, entry.file)
    }

    if (entry.data.repo && entry.data.type) {
      const derived = derivedType(entry.data.repo, schema)
      if (entry.data.type !== derived) {
        fail(
          `commits type "${entry.data.type}", but ${entry.data.repo} derives "${derived}". The sync owns this field.`
        )
      }
    }

    // An icon is required of a module the project maintains, because nothing
    // stops us drawing one. A stranger's module is listed without one, and the
    // build draws a lettermark rather than leaving a hole on the page.
    if (entry.data.icon && !icons.has(entry.data.icon)) {
      fail(`names the icon ${entry.data.icon}, which is not in icons/`)
    } else if (
      !entry.data.icon &&
      entry.data.repo &&
      firstPartyOwners(schema).includes(owner(entry.data.repo))
    ) {
      fail('is maintained by the project and so needs an icon in icons/')
    }

    if (
      entry.data.repo &&
      legacyOwners(schema).includes(owner(entry.data.repo))
    ) {
      warn(
        `is listed from ${owner(entry.data.repo)}, an owner the project is leaving. The module is expected to migrate to druxt or druxt-contrib, and a listing here will need updating when it does.`
      )
    }
  }

  return { errors, warnings }
}

async function main() {
  const schema = await readSchema()
  const entries = await readModules()
  const icons = await readIcons()
  const { errors, warnings } = validate(entries, schema, icons)

  for (const warning of warnings) console.warn(`warning  ${warning}`)
  for (const error of errors) console.error(`error    ${error}`)

  // A file that is not a registry file at all is reported as an error rather
  // than counted as a module, so the tally matches what was actually read.
  const read = entries.filter((entry) => !entry.extensionError).length
  const counted = `${read} module${read === 1 ? '' : 's'}`
  if (errors.length) {
    console.error(
      `\n${counted}, ${errors.length} error${errors.length === 1 ? '' : 's'}.`
    )
    process.exitCode = 1
    return
  }
  console.log(
    `\n${counted}, no errors, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`
  )
}

// Run only when invoked directly, so the tests can import validate() without
// the script walking the real modules directory.
if (argv[1] && (await realpath(argv[1])) === fileURLToPath(import.meta.url)) {
  await main()
}
