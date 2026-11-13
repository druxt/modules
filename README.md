# Druxt module registry

The list of every [Druxt](https://druxtjs.org) module: the ones the project
maintains, the contributed ones, and anyone else's.

One YAML file per module in `modules/`. A build compiles them into a single
`modules.json`, which [druxtjs.org](https://druxtjs.org) and other tools read.

## List your module

Open a pull request that adds one file. You need no account anywhere but
GitHub, and no issue first. [CONTRIBUTING.md](CONTRIBUTING.md) has the field
reference and the review steps.

Listing is not an endorsement. The `type` field says who maintains a module,
and that is the whole judgement the registry makes.

## An entry

```yaml
name: config-pages
repo: druxt-contrib/druxt-config-pages
category: content-and-entities
status: stable
icon: config-pages.svg
drupal:
  - name: config_pages
    label: Config Pages
```

Five fields are required of you, five more are yours where they apply, and the
rest are filled in for you:

| Field                                                     | Written by                     |
| --------------------------------------------------------- | ------------------------------ |
| `name`, `repo`, `category`, `status`, `drupal`            | you, in a pull request         |
| `path`, `icon`, `website`, `aliases`, `maintainers`       | you, where they apply          |
| `description`, `npm`, `compatibility`, `type`, `archived` | the sync, from your repository |
| version, downloads, stars, `iconUrl`                      | the build, from npm and GitHub |

A version or a download count in a registry file is an error. Those numbers
change daily, and the build resolves them fresh.

`maintainers` wants a GitHub handle, and nothing the sync reads states one: npm
gives npm usernames, `package.json` gives a name and an email, and a
contributor list is not a maintainer list. So the sync leaves the field alone
and it stays yours to write.

[`schema/module.schema.json`](schema/module.schema.json) defines every field.
The validator reads that file, so the documented shape and the enforced shape
are the same shape.

## Read the registry

`npm run build` compiles `modules/` into `modules.json` and commits it, so
reading the registry is reading a file:

```sh
curl https://cdn.jsdelivr.net/gh/druxt/modules@main/modules.json
```

A tag is immutable, so pin one if you need a stable read:
`https://cdn.jsdelivr.net/gh/druxt/modules@v1/modules.json`. The `main` path is
cached at the edge for twelve hours.

No service runs behind this. The file is served from the repository.

## Badge a module

The build also writes one [shields.io](https://shields.io) endpoint response
per module, so a README can show a module's status without hard-coding it:

```markdown
![status](https://img.shields.io/endpoint?url=https://cdn.jsdelivr.net/gh/druxt/modules@main/badges/node-preview.json)
```

Append `&label=release` or any other
[shields parameter](https://shields.io/badges/endpoint-badge) to restyle it.
The badge reads the registry, so changing a module's `status` here updates
every badge pointing at it, with no commit to the repository showing it.

## Work on the registry

```sh
npm install
npm run hooks:install
npm run validate
npm run build
npm test
npm run lint
```

`npm run validate` checks every file in `modules/` and prints what is wrong
with each one. It is the same command CI runs.

`npm run build` rewrites `modules.json` and `badges/`. The output is a function
of `modules/` alone, with no timestamp in it, so `npm run build:check` can tell
you whether what is committed matches what the registry says. CI runs that
check, which is what makes the URLs above trustworthy.

## Links

- [druxtjs.org/modules](https://druxtjs.org/modules) — the rendered index
- [druxtjs.org](https://druxtjs.org) — documentation
- [druxt/druxt.js](https://github.com/druxt/druxt.js) — the framework
- [Discord](https://discord.druxtjs.org) — questions and help

## Licence

[MIT](LICENSE)
