// The listing gate for a pull request, scoped to the entries it touches.
//
// `sync:check` is deliberately out of the pipeline because it reads every
// listed repository, and a rate limit would fail a pull request that changed
// nothing it touches. A pull request that adds one listing needs one
// repository, so the same reads are affordable here and worth doing: a listing
// is a claim about someone else's repository, and the only way to know whether
// the claim holds is to go and look.
//
// The report is what a reviewer confirms against. It never writes to a
// registry file: a contributor's claim and the live fact are kept apart so the
// reviewer can see where they differ.
//
// Exit codes: 0 reviewable, 1 a listing must not be merged as written, 2
// cannot run.

import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'

import { liveSources } from './sources.mjs'
import { derivedType, readModules, readSchema } from './registry.mjs'
import { resolve } from './sync.mjs'

/**
 * A listing claiming a release that npm cannot confirm is the case worth
 * stopping on: the status drives the badge, and a badge is read as a fact.
 */
export function statusFindings(data, values, published) {
  const findings = []
  const claimsRelease = data.status === 'stable' || data.status === 'prerelease'
  if (claimsRelease && !values.npm && !published) {
    findings.push(
      `claims \`status: ${data.status}\` but no published npm package was found, so the badge would read ${data.status} for something nobody can install`
    )
  }
  if (data.status !== 'deprecated' && values.archived) {
    findings.push(
      'is archived on GitHub but not marked `status: deprecated`, so the listing would present an abandoned module as current'
    )
  }
  return findings
}

export function report(rows) {
  const lines = ['## Listing review', '']
  for (const row of rows) {
    lines.push(`### \`${row.key}\``, '')
    if (row.error) {
      lines.push(
        `**This listing cannot be merged as written.** ${row.error}`,
        ''
      )
      continue
    }
    lines.push(
      '| | Claimed | Found |',
      '| --- | --- | --- |',
      `| repository | \`${row.claimed.repo}\` | ${row.found.repoUrl} |`,
      `| type | ${row.claimed.type ?? '_derived_'} | \`${row.found.type}\` |`,
      `| status | \`${row.claimed.status}\` | ${row.found.npm ? `\`${row.found.npm}\` on npm` : 'no npm package found'} |`,
      `| archived | | ${row.found.archived ? '**yes**' : 'no'} |`,
      `| druxt | | \`${row.found.druxt}\` |`,
      ''
    )
    for (const finding of row.findings) {
      lines.push(`- **Confirm:** this listing ${finding}`)
    }
    for (const note of row.notes) lines.push(`- Note: ${note}`)
    if (!row.findings.length && !row.notes.length) {
      lines.push('- Nothing to query. The claims match the repository.')
    }
    lines.push('')
  }
  lines.push(
    '_A listing is a claim about a repository this project does not own, so a',
    'maintainer confirms it rather than a check passing it. The table is the',
    'evidence, not the decision._'
  )
  return lines.join('\n')
}

async function main(keys) {
  if (!keys.length) {
    console.log('No registry files changed, so there is no listing to review.')
    return
  }
  const [schema, entries] = await Promise.all([readSchema(), readModules()])
  const sources = liveSources()

  const wanted = keys
    .map((key) => entries.find((entry) => entry.key === key))
    .filter(Boolean)

  const missing = keys.filter(
    (key) => !entries.some((entry) => entry.key === key)
  )
  // A removed listing is a legitimate change, so a key with no file is
  // reported rather than treated as an error.
  for (const key of missing) {
    console.log(`\`${key}\` is no longer in modules/, so it was not reviewed.`)
  }

  const rows = []
  let blocked = 0

  for (const entry of wanted) {
    if (entry.parseError || entry.extensionError) {
      rows.push({
        key: entry.key,
        error: entry.parseError
          ? `It does not parse as YAML: ${entry.parseError}`
          : 'It is not a .yml file.',
      })
      blocked += 1
      continue
    }
    const { values, notes = [], error } = await resolve(entry, schema, sources)
    if (error) {
      rows.push({ key: entry.key, error })
      blocked += 1
      continue
    }
    const published = Boolean(entry.data.npm)
    rows.push({
      key: entry.key,
      claimed: entry.data,
      found: {
        repoUrl: `https://github.com/${entry.data.repo}`,
        type: derivedType(entry.data.repo, schema),
        npm: values.npm,
        archived: Boolean(values.archived),
        druxt: values.compatibility?.druxt ?? 'unknown',
      },
      findings: statusFindings(entry.data, values, published),
      notes,
    })
  }

  console.log(report(rows))

  if (blocked) {
    console.error(
      `\n${blocked} listing${blocked === 1 ? '' : 's'} cannot be merged as written.`
    )
    process.exitCode = 1
  }
}

if (argv[1] && argv[1] === fileURLToPath(import.meta.url)) {
  await main(argv.slice(2).filter((arg) => !arg.startsWith('--')))
}
