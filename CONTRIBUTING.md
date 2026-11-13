# Contributing

## List a module

One pull request. One new file. No issue first.

1. Fork this repository.
2. Add `modules/<name>.yml`. The name is the module's short name with no
   organisation prefix: `config-pages`, not `druxt-config-pages` and not
   `@druxt-contrib/config-pages`.
3. Run `npm run validate`.
4. Open a pull request.

CI runs the validator on your pull request. Its output says what is wrong with
your file, if anything.

Your module needs a public repository. The build refuses a private one, whatever
the credential running it can see.

## The fields you write

```yaml
name: config-pages
repo: druxt-contrib/druxt-config-pages
category: content-and-entities
status: stable
drupal:
  - name: config_pages
    label: Config Pages
website: https://druxtjs.org/modules/config-pages
icon: config-pages.svg
```

| Field      | Required | Value                                                                          |
| ---------- | -------- | ------------------------------------------------------------------------------ |
| `name`     | yes      | The registry key. Matches the file name.                                       |
| `repo`     | yes      | `owner/name` on GitHub.                                                        |
| `category` | yes      | One of the seven below.                                                        |
| `status`   | yes      | `stable`, `prerelease`, `unreleased` or `deprecated`.                          |
| `drupal`   | yes      | The Drupal projects or core subsystems the module renders. Empty list if none. |
| `website`  | no       | The module's home page.                                                        |
| `icon`     | no       | A file name under `icons/`. Required of a module this project maintains.       |
| `path`     | no       | The package directory, for a module published from a monorepo.                 |
| `aliases`  | no       | Earlier names the module was published under.                                  |

### Categories

| Category                 | For                                       |
| ------------------------ | ----------------------------------------- |
| `core`                   | The framework itself                      |
| `content-and-entities`   | Entities, fields, field formatters, views |
| `routing-and-navigation` | Routes, menus, breadcrumbs, redirects     |
| `site-and-layout`        | Blocks, regions, layouts, themes          |
| `authoring-and-preview`  | Editing, preview, revisions, workflow     |
| `authentication`         | Sign-in, tokens, permissions              |
| `tooling`                | Build, test, development                  |

`core` is the framework, not every package the monorepo publishes: `druxt-menu`
is `routing-and-navigation`, the same as anyone else's menu module.

Seven, where Nuxt has twenty-eight. At this ecosystem's size most of twenty-eight
would hold one entry. Ask in the pull request if nothing fits, rather than
stretching one that nearly does.

### Icons

Add your icon to `icons/` in the same pull request and name the file in `icon`.
A file name, not a URL: the registry serves the icon it holds, so a listing
cannot break because someone else's host moved. SVG or PNG, square, lowercase
file name.

An icon is required of a module the Druxt project maintains, and optional for
yours. Without one, the build draws a lettermark, so the index never has a
hole where a logo should be.

### The `drupal` field

Each entry gives a Drupal machine name and a label:

```yaml
drupal:
  - name: layout_builder
    label: Layout Builder
  - name: layout_discovery
    label: Layout Discovery
```

The machine name is what appears in the project's `info.yml`: lowercase,
underscores, no hyphens. Core subsystems count. This is how a Drupal developer
finds your module, by the module they already run, so fill it in carefully.

## The fields you do not write

The sync writes `description`, `npm`, `maintainers`, `compatibility` and
`type`, reading your repository on every run. Hand-editing them is pointless:
the next sync overwrites the value.

`compatibility.druxt` comes from your `peerDependencies.druxt`, or from your
`dependencies.druxt` when you declare no peer. Declare one of them in your
`package.json` and the registry records the right range. Declare neither and
the registry records `unknown`, because a guessed range is worse than an
absent one.

`type` comes from the owner of `repo`. `druxt/*` is `official`,
`druxt-contrib/*` is `contrib`, everything else is `3rd-party`. A committed
value that disagrees is an error, not an override.

The build resolves versions, download counts, star counts and the absolute
icon URL. A registry file holding one of those fails validation.

The sync also fills `website` with your GitHub repository when you give none,
and resolves a `url` for each `drupal` entry that names a contributed project.
`archived` comes from GitHub, so a listing cannot keep looking maintained after
its repository is archived.

## Changing the registry itself

Install, then turn on the hooks:

```sh
npm install
npm run hooks:install
```

The hooks run the linters and the tests before each commit, and check the
commit message.

| Command                   | What it does                               |
| ------------------------- | ------------------------------------------ |
| `npm run validate`        | Validates every file in `modules/`         |
| `npm test`                | Runs the unit tests                        |
| `npm run lint`            | Runs every linter                          |
| `npm run lint:format:fix` | Formats what `lint:format` complains about |

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org).
Pull request titles too: this repository squash-merges, so the title becomes
the commit subject.

A new validation rule needs a test. The test suite is one case per rule,
written as a single change to one valid entry, so a rule that stops working
stops being the only difference between a pass and a failure.

## Licence

Contributions are licensed under [MIT](LICENSE), the same terms as the rest of
the repository.

The [Code of Conduct](https://github.com/druxt/.github/blob/main/CODE_OF_CONDUCT.md)
applies here.
