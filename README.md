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

Five fields are required of you, six more are yours where they apply, and the
rest are filled in for you:

| Field                                                          | Written by                     |
| -------------------------------------------------------------- | ------------------------------ |
| `name`, `repo`, `category`, `status`, `drupal`                 | you, in a pull request         |
| `path`, `icon`, `website`, `aliases`, `maintainers`, `options` | you, where they apply          |
| `description`, `npm`, `compatibility`, `type`, `archived`      | the sync, from your repository |
| version, downloads, stars, `iconUrl`                           | the build, from npm and GitHub |

A version or a download count in a registry file is an error. Those numbers
change daily, and the build resolves them fresh.

`maintainers` wants a GitHub handle, and nothing the sync reads states one: npm
gives npm usernames, `package.json` gives a name and an email, and a
contributor list is not a maintainer list. So the sync leaves the field alone
and it stays yours to write.

[`schema/module.schema.json`](schema/module.schema.json) defines every field.
The validator reads that file, so the documented shape and the enforced shape
are the same shape.

### What an installer reads

Four optional fields tell a command line tool how to install and configure a
module. You write them by hand. The build copies them to `modules.json` as
written, and the sync never touches them. An entry without them is complete.

```yaml
name: auth
repo: druxt/druxt-auth
category: authentication
status: stable
icon: auth.svg
drupal:
  - name: simple_oauth
    label: Simple OAuth
    setup:
      - title: Generate the keys that sign the tokens, outside the web root
        command: drush simple-oauth:generate-keys /absolute/path/to/keys
        url: https://git.drupalcode.org/project/simple_oauth/-/blob/6.1.x/README.md
options:
  - name: clientId
    type: string
    description: The Client ID field of the Drupal consumer, not its UUID.
    required: true
  - name: passwordSession
    type: boolean
    description: Open a Drupal session beside the password grant.
    default: false
```

`options` lists what the module takes in a site's configuration. Each option
has a `name`, a `type` and a `description`, and may have a `default`, a
`required` flag and an `example`. The `type` is `string`, `boolean`, `number`,
`array` or `object`. A nested option has a dotted name, so `proxy.api` is the
`api` key of `proxy`. A name appears once in an entry, and a `default` of a
different type from the one the option states is an error.

The other three belong to an item in `drupal`:

```yaml
drupal:
  - name: commerce_cart
    label: Commerce Cart
    composer:
      package: drupal/commerce
      constraint: ^3.0
    patches:
      - description: What the patch fixes
        url: https://www.example.com/commerce/merge_requests/1.diff
        issue: https://www.example.com/commerce/issues/1
        until: 3.1.0
```

`composer` names the Composer package that provides the Drupal module, as
`package` in `vendor/name` form with an optional `constraint`. Write it only
where the package is not `drupal/<name>`, which is the case for a module that
ships inside another project. An item with `core: true` is part of Drupal core
and has no package, so `composer` is an error there.

`setup` lists what is left to do once the Drupal module is enabled, in order.
A step has a `title`, and may have a `command` to show and a `url` to its
documentation. The `url` is https. A tool prints the steps. It does not run
them.

`patches` lists the patches the module needs until a fix is released. A patch
has a `description` and a `url`, both required, and the `url` is https. It may
name the `package` it applies to when that is not the item's own, the `issue`
it belongs to, and `until`, the version of the patched package that contains
the fix. A core item may carry patches, with `drupal/core` as the `package`.

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
