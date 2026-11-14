# Changelog

This repository publishes data rather than a package, so there are no version
numbers to track. Entries record changes to how the registry works, not every
module listed: a listing shows up in `modules.json` the moment it merges, and
the git history of `modules/` is the record of those.

## Unreleased

### Added

- The registry itself: one YAML file per module in `modules/`, validated
  against `schema/module.schema.json`. The validator reads that schema, so the
  documented shape and the enforced shape are one shape.
- A build that compiles `modules.json` and a Shields endpoint badge per module.
  It writes no timestamp, so the committed bytes can be compared against a
  fresh build, which is what `npm run build:check` does on every pull request.
- A sync that fills the derived fields from each module's own repository, and
  refuses a repository that is private or unreadable.
- A listing review that runs on a pull request touching `modules/`, reads the
  repositories that pull request lays claim to, and posts what it found for a
  maintainer to confirm.
