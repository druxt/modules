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
drupal:
  - name: config_pages
    label: Config Pages
```

You write five fields. The rest are filled in for you:

| Field                                                                     | Written by                     |
| ------------------------------------------------------------------------- | ------------------------------ |
| `name`, `repo`, `category`, `status`, `drupal`, `icon`, `website`, `docs` | you, in a pull request         |
| `description`, `npm`, `maintainers`, `compatibility`, `type`              | the sync, from your repository |
| version, downloads, stars                                                 | the build, from npm and GitHub |

A version or a download count in a registry file is an error. Those numbers
change daily, and the build resolves them fresh.

[`schema/module.schema.json`](schema/module.schema.json) defines every field.
The validator reads that file, so the documented shape and the enforced shape
are the same shape.

## Read the registry

```sh
curl https://cdn.jsdelivr.net/gh/druxt/modules@main/modules.json
```

A tag is immutable, so pin one if you need a stable read:
`https://cdn.jsdelivr.net/gh/druxt/modules@v1/modules.json`. The `main` path is
cached at the edge for twelve hours.

No service runs behind this. The file is served from the repository.

## Work on the registry

```sh
npm install
npm run hooks:install
npm run validate
npm test
npm run lint
```

`npm run validate` checks every file in `modules/` and prints what is wrong
with each one. It is the same command CI runs.

## Links

- [druxtjs.org/modules](https://druxtjs.org/modules) — the rendered index
- [druxtjs.org](https://druxtjs.org) — documentation
- [druxt/druxt.js](https://github.com/druxt/druxt.js) — the framework
- [Discord](https://discord.druxtjs.org) — questions and help

## Licence

[MIT](LICENSE)
