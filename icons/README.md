# Icons

One file per module, named after its registry key, referenced from that
module's `icon` field. The build resolves the absolute URL into the compiled
output, so nothing outside this directory needs to know where the files live.

A file name, never a URL. An icon hotlinked from someone else's host is a
listing that breaks when that host moves, and a page that loads from somewhere
the registry does not control.

The icons the Druxt project maintains are rendered from geometry that already
exists rather than drawn here: the monorepo packages from druxtjs.org's own
module icon set, the separately released modules from the Druxt mark set. Both
follow the same grammar, a 24px grid with 2px round strokes, `#036397` for the
Drupal side and `#3b8070` for the Nuxt side.

Listing your own module? Add a square SVG or PNG with a lowercase file name.
