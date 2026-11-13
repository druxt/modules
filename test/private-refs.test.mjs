// The leak guard's own tests, which it did not have.
//
// This repository is public and the guard is the only thing standing between
// an internal hostname and a published file, so the cases below are written as
// negative controls: each one is a host that the guard let through at some
// point, and the assertion is that it no longer does. A test that only checked
// `forge.local` would have passed throughout every hole listed here.
//
// The file names private hosts on purpose, so it is exempt from the guard via
// the SELF list the guard keeps. That exemption is why the hosts below are
// invented rather than real: this repository is public, and a fixture is a file
// content like any other, so a real internal name here would be the very leak
// the guard exists to stop, in the one file the guard does not read.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import {
  findPrivateRefs,
  lintPrivateRefs,
  mappedToIpv4,
} from '../scripts/lint-private-refs.mjs'

const script = fileURLToPath(
  new URL('../scripts/lint-private-refs.mjs', import.meta.url)
)

const hosts = (text) => findPrivateRefs(text).map((hit) => hit.host)
const url = (host) => `see http://${host}/path for details`

// Each of these was reachable only on a private network and passed the guard.
const BYPASSED = [
  // An unanchored loopback exemption matched the first label, not the address.
  ['127.files.local', 'a private host whose name starts with 127.'],
  ['169.254.10.1', 'RFC 3927 IPv4 link-local'],
  ['db.home.arpa', 'RFC 8375 home network naming'],
  // The bracket class was hex and dots, so it stopped at the % of a zone id.
  ['[fe80::1%eth0]', 'a link-local address carrying a zone id'],
  ['[fe80::1%25eth0]', 'the same, percent-encoded as RFC 6874 asks'],
]

for (const [host, why] of BYPASSED) {
  test(`flags ${host} (${why})`, () => {
    const reported = host.startsWith('[') ? 'fe80::1' : host
    assert.deepEqual(hosts(url(host)), [reported])
  })
}

// The cases the guard already caught. Kept so a rewrite of the patterns cannot
// trade one hole for another.
const PRIVATE = [
  'forge.local',
  '10.1.2.3',
  '192.168.0.17',
  '172.20.0.5',
  'wiki.internal',
  'host.lan',
  'files.corp',
  'build.intranet',
  'nas.home',
  '[fd00::1]',
  '[fe80::1]',
]

for (const host of PRIVATE) {
  test(`flags ${host}`, () => {
    assert.deepEqual(hosts(url(host)), [host.replace(/^\[|\]$/g, '')])
  })
}

// The exemptions have to keep working, or the guard gets switched off by the
// first contributor who cannot run the example locally.
const ALLOWED = [
  'localhost',
  '127.0.0.1',
  '127.0.0.53',
  'druxt.ddev.site',
  'druxt.lndo.site',
  // An unbracketed IPv6 authority is not a URL, so there is no host to read
  // out of one. These are here to pin that, not to claim they are public.
  'fd00::1',
  'fe80::1',
  '[::1]',
  '[2606:4700::1]',
  'druxtjs.org',
  'cdn.jsdelivr.net',
  'registry.npmjs.org',
]

for (const host of ALLOWED) {
  test(`allows ${host}`, () => {
    assert.deepEqual(hosts(url(host)), [])
  })
}

test('a port does not hide the host', () => {
  assert.deepEqual(hosts(url('forge.local:8080')), ['forge.local'])
  assert.deepEqual(hosts(url('127.0.0.1:8080')), [])
})

test('userinfo is stepped over rather than read as the host', () => {
  assert.deepEqual(hosts('git clone http://oauth2:TOKEN@forge.local/a/b.git'), [
    'forge.local',
  ])
})

test('an scp-style git remote is a host too', () => {
  assert.deepEqual(hosts('git@forge.local:druxt/modules.git'), ['forge.local'])
})

test('the line number is the line the host sits on', () => {
  const found = findPrivateRefs(['one', 'two', url('forge.local')].join('\n'))
  assert.deepEqual(found, [{ line: 3, host: 'forge.local' }])
})

test('every spelling of an IPv4-mapped literal resolves to the address', () => {
  for (const mapped of [
    '::ffff:10.0.0.8',
    '::ffff:0a00:0008',
    '0:0:0:0:0:ffff:10.0.0.8',
    '0:0:0:0:0:ffff:0a00:0008',
  ]) {
    assert.equal(mappedToIpv4(mapped), '10.0.0.8', mapped)
  }
})

test('a bracketed IPv4-mapped literal is flagged by its address', () => {
  assert.deepEqual(hosts(url('[::ffff:10.0.0.8]')), ['10.0.0.8'])
})

test('a public host is not mistaken for a mapped address', () => {
  assert.equal(mappedToIpv4('druxtjs.org'), 'druxtjs.org')
  assert.equal(mappedToIpv4('2606:4700::1'), '2606:4700::1')
})

/** A throwaway git repository holding `files`, so the run is a real run. */
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'druxt-private-refs-'))
  execFileSync('git', ['-C', dir, 'init', '--quiet'])
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  execFileSync('git', ['-C', dir, 'add', '-A'])
  return dir
}

test('it reports the file and line of a tracked private host', () => {
  const dir = repo({ 'README.md': ['# Title', url('forge.local')].join('\n') })
  assert.deepEqual(lintPrivateRefs(dir), ['README.md:2: forge.local'])
})

test('an untracked file is not published, so it is not checked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'druxt-private-refs-'))
  execFileSync('git', ['-C', dir, 'init', '--quiet'])
  writeFileSync(join(dir, 'notes.md'), url('forge.local'))
  assert.deepEqual(lintPrivateRefs(dir), [])
})

test('the command exits 1 and names the host', () => {
  const dir = repo({ 'README.md': url('forge.local') })
  try {
    execFileSync('node', [script, dir], { encoding: 'utf8', stdio: 'pipe' })
    assert.fail('the command passed over a private host')
  } catch (error) {
    assert.equal(error.status, 1)
    assert.match(error.stderr, /README\.md:1: forge\.local/)
  }
})

test('the command exits 0 on a clean repository', () => {
  const dir = repo({ 'README.md': url('druxtjs.org') })
  const out = execFileSync('node', [script, dir], { encoding: 'utf8' })
  assert.match(out, /No private hosts referenced/)
})

test('this repository is clean', () => {
  assert.deepEqual(lintPrivateRefs(), [])
})
