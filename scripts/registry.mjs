// Reading the registry: the schema, the files, and the values derived from them.
//
// Everything here is pure. The validator reports on what these functions
// return, and the build compiles it, so neither holds its own idea of what a
// registry file means.

import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse } from 'yaml'

const root = fileURLToPath(new URL('..', import.meta.url))

export const paths = {
  root,
  modules: join(root, 'modules'),
  icons: join(root, 'icons'),
  schema: join(root, 'schema', 'module.schema.json'),
}

export async function readSchema(path = paths.schema) {
  return JSON.parse(await readFile(path, 'utf8'))
}

/** The accepted categories, read from the schema rather than repeated here. */
export function categories(schema) {
  return schema.properties.category.enum
}

/** The fields the build owns, which a registry file must not carry. */
export function buildFields(schema) {
  return schema['x-druxt-build-fields'].fields
}

/** The owners the project is leaving. */
export function legacyOwners(schema) {
  return schema['x-druxt-legacy-owners'].owners
}

/** The owner types the schema maps, in the order it maps them. */
export function ownerTypes(schema) {
  return Object.keys(schema['x-druxt-owners']).filter(
    (key) => key !== 'description'
  )
}

/**
 * The owners whose modules the project maintains, and so must carry an icon.
 *
 * Every mapped owner is one of ours by definition, so this reads the same map
 * the type derives from. A second list would be a second place to forget.
 */
export function firstPartyOwners(schema) {
  const owners = schema['x-druxt-owners']
  return ownerTypes(schema).flatMap((type) => owners[type] ?? [])
}

/** The icon files the repository holds. */
export async function readIcons(dir = paths.icons) {
  try {
    return new Set(await readdir(dir))
  } catch {
    return new Set()
  }
}

export function owner(repo) {
  return typeof repo === 'string' ? repo.split('/')[0] : undefined
}

/**
 * The module type, from the owner of its repository. An owner the schema does
 * not map is third-party, which is the common case and needs no entry.
 */
export function derivedType(repo, schema) {
  const owners = schema['x-druxt-owners']
  const found = owner(repo)
  for (const type of ownerTypes(schema)) {
    if ((owners[type] ?? []).includes(found)) return type
  }
  return '3rd-party'
}

/** The one extension a registry file may carry. */
export const EXTENSION = '.yml'

/**
 * Whether an entry's parsed YAML is a mapping of fields.
 *
 * An empty file parses to null, and a scalar or a list parses to something
 * that is not a listing, all without a parse error. Every consumer of
 * readModules has to refuse those, so the test lives here rather than being
 * written out again in each of them. It reads data that has already parsed,
 * so it says nothing about an entry carrying a parseError.
 */
export function holdsMapping(entry) {
  return (
    entry.data !== null &&
    typeof entry.data === 'object' &&
    !Array.isArray(entry.data)
  )
}

/** Every registry file, with its parse result and the key its path implies. */
export async function readModules(dir = paths.modules) {
  const names = (await readdir(dir)).sort()

  return Promise.all(
    names.map(async (file) => {
      const path = join(dir, file)

      // Returning only the .yml files would make every other name invisible
      // rather than wrong. A contributor's .yaml would be skipped by the
      // validator, the tests and the build alike, and every job would stay
      // green over a module nobody had listed. One spelling, and anything
      // else is reported.
      if (!file.endsWith(EXTENSION)) {
        return { file, path, key: file, extensionError: true }
      }

      const key = basename(file, EXTENSION)
      const source = await readFile(path, 'utf8')

      try {
        return { file, path, key, data: parse(source) }
      } catch (error) {
        return { file, path, key, parseError: error.message }
      }
    })
  )
}
